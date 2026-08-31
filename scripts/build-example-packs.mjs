import { createWriteStream } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yazl from 'yazl';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const BUNDLED_CHARACTER_DIRS = ['cookie', 'pudding', 'cookie-front', 'pudding-front'];
const root = process.env.COZYKIN_EXAMPLES_ROOT ?? join(projectRoot, 'examples');
const allowed = new Set(['.json', '.png', '.webp', '.md', '.txt']);
const schemaFiles = { 'manifest.json': 'manifest.schema.json', 'character.json': 'character.schema.json', 'behaviors.json': 'behaviors.schema.json', 'emotions.json': 'emotions.schema.json' };

if (process.argv.includes('--print-bundled-dirs')) {
  console.log(JSON.stringify(BUNDLED_CHARACTER_DIRS));
  process.exit(0);
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result.sort();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function semanticErrors(manifest, character, behaviorsFile, emotionsFile, fileSizes) {
  const errors = [];
  const behaviors = new Map();
  for (const behavior of behaviorsFile.behaviors) {
    if (behaviors.has(behavior.id)) errors.push(`defines behavior "${behavior.id}" more than once`);
    behaviors.set(behavior.id, behavior);
    if (behavior.frameDurationsMs && behavior.frameDurationsMs.length !== behavior.frames.length) errors.push(`has mismatched frame durations for "${behavior.id}"`);
    for (const frame of behavior.frames) {
      if (!fileSizes.has(frame) || fileSizes.get(frame) === 0) errors.push(`behavior "${behavior.id}" references a missing or empty frame "${frame}"`);
    }
  }
  if (!behaviors.has('idle')) errors.push('does not define an idle behavior');
  if (!behaviors.has(manifest.entryBehavior)) errors.push(`entry behavior "${manifest.entryBehavior}" is not defined`);
  for (const behavior of behaviors.values()) {
    const seen = new Set();
    let current = behavior.id;
    while (current && current !== 'idle') {
      if (seen.has(current)) { errors.push(`fallback for "${behavior.id}" does not terminate at idle`); break; }
      seen.add(current);
      current = behaviors.get(current)?.fallback;
    }
    if (!current) errors.push(`fallback for "${behavior.id}" is not defined`);
  }
  const emotionIds = new Set(emotionsFile.emotions.map((emotion) => emotion.id));
  if (!emotionIds.has(emotionsFile.defaultEmotion)) errors.push('default emotion is not defined');
  for (const emotion of emotionsFile.emotions) if (!behaviors.has(emotion.behaviorId)) errors.push(`emotion "${emotion.id}" references an undefined behavior`);
  const wakeVariants = character.presentation?.wakeVariants ?? [];
  const wakeIds = new Set();
  for (const variant of wakeVariants) {
    if (wakeIds.has(variant.behaviorId)) errors.push(`declares wake behavior "${variant.behaviorId}" more than once`);
    wakeIds.add(variant.behaviorId);
    const behavior = behaviors.get(variant.behaviorId);
    if (!behavior) errors.push(`wake behavior "${variant.behaviorId}" is not defined`);
    else if (behavior.loop) errors.push(`wake behavior "${variant.behaviorId}" loops`);
  }
  return errors;
}

async function validatePack(name) {
  const source = join(root, name);
  let sourceFiles;
  try {
    sourceFiles = await files(source);
  } catch (error) {
    throw new Error(`Bundled Pack "${name}" is unavailable at ${source}.`, { cause: error });
  }
  const relativeFiles = sourceFiles.map((path) => relative(source, path).split('\\').join('/'));
  const disallowed = relativeFiles.find((path) => !allowed.has(path.slice(path.lastIndexOf('.')).toLowerCase()));
  if (disallowed) throw new Error(`Invalid bundled Pack "${name}" contains a disallowed file "${disallowed}".`);
  const fileSizes = new Map(await Promise.all(relativeFiles.map(async (path) => [path, (await stat(join(source, path))).size])));
  const missingRoots = ['manifest.json', 'character.json', 'behaviors.json', 'emotions.json', 'preview/thumbnail.png'].filter((path) => !fileSizes.has(path) || fileSizes.get(path) === 0);
  if (missingRoots.length > 0) throw new Error(`Invalid bundled Pack "${name}": missing or empty required file(s): ${missingRoots.join(', ')}.`);
  let parsed;
  try {
    parsed = Object.fromEntries(await Promise.all(Object.keys(schemaFiles).map(async (file) => [file, await readJson(join(source, file))])));
  } catch (error) {
    throw new Error(`Invalid bundled Pack "${name}": required JSON could not be parsed.`, { cause: error });
  }
  const schemaVersion = parsed['manifest.json'].schemaVersion;
  const schemaDirectory = schemaVersion === '1.0' ? 'v1' : schemaVersion === '1.1' ? 'v1.1' : null;
  if (!schemaDirectory) throw new Error(`Invalid bundled Pack "${name}": unsupported schema version "${String(schemaVersion)}".`);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const [target, schemaFile] of Object.entries(schemaFiles)) {
    const schema = await readJson(join(projectRoot, 'schemas', schemaDirectory, schemaFile));
    const validate = ajv.compile(schema);
    if (!validate(parsed[target])) throw new Error(`Invalid bundled Pack "${name}": ${target} does not match Pack ${schemaVersion} schema.`);
  }
  const errors = semanticErrors(parsed['manifest.json'], parsed['character.json'], parsed['behaviors.json'], parsed['emotions.json'], fileSizes);
  if (errors.length > 0) throw new Error(`Invalid bundled Pack "${name}": ${errors[0]}.`);
  return { source, files: sourceFiles };
}

const packs = [];
for (const name of BUNDLED_CHARACTER_DIRS) {
  packs.push({ name, ...await validatePack(name) });
}

async function assertPublishableTargets() {
  const targets = [];
  for (const { name } of packs) {
    const target = join(root, `${name}.cozykin.zip`);
    try {
      if (!(await lstat(target)).isFile()) throw new Error(`Archive target must be a regular file or absent: ${target}`);
      targets.push({ name, target, exists: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      targets.push({ name, target, exists: false });
    }
  }
  return targets;
}

async function writeArchive(target, source, sourceFiles) {
  const archive = new yazl.ZipFile();
  for (const path of sourceFiles) {
    const archivePath = relative(source, path).split('\\').join('/');
    const extension = archivePath.slice(archivePath.lastIndexOf('.')).toLowerCase();
    if (!allowed.has(extension)) throw new Error(`Disallowed example file: ${archivePath}`);
    archive.addFile(path, archivePath, { mode: 0o100644, mtime: new Date('2026-07-17T00:00:00.000Z') });
  }
  archive.end();
  await new Promise((resolve, reject) => {
    archive.outputStream.pipe(createWriteStream(target, { mode: 0o600 })).on('close', resolve).on('error', reject);
  });
}

const targets = await assertPublishableTargets();
const stagingDirectory = await mkdtemp(join(root, '.cozykin-example-zips-'));
const backups = [];
const published = [];
let preserveStagingForRecovery = false;
try {
  for (const { name, source, files: sourceFiles } of packs) {
    await writeArchive(join(stagingDirectory, `${name}.cozykin.zip`), source, sourceFiles);
  }

  try {
    for (const { name, target, exists } of targets) {
      if (!exists) continue;
      const backup = join(stagingDirectory, `${name}.published-backup`);
      await rename(target, backup);
      backups.push({ target, backup });
    }

    const injectedFailureTarget = Number.parseInt(process.env.COZYKIN_TEST_FAIL_PUBLISH_AT ?? '', 10);
    for (const [index, { name, target }] of targets.entries()) {
      if (injectedFailureTarget === index + 1) throw new Error(`Injected archive publication failure at target ${index + 1}`);
      await rename(join(stagingDirectory, `${name}.cozykin.zip`), target);
      published.push(target);
    }
  } catch (publishError) {
    const rollbackErrors = [];
    for (const target of published.reverse()) {
      try { await rm(target, { force: true }); } catch (error) { rollbackErrors.push(error); }
    }
    for (const { target, backup } of backups.reverse()) {
      try { await rename(backup, target); } catch (error) { rollbackErrors.push(error); }
    }
    if (rollbackErrors.length > 0 && publishError instanceof Error) {
      publishError.rollbackErrors = rollbackErrors;
      preserveStagingForRecovery = true;
    }
    throw publishError;
  }

  for (const { target } of targets) {
    console.log(`Built ${target}`);
  }
} finally {
  if (!preserveStagingForRecovery) await rm(stagingDirectory, { recursive: true, force: true });
}
