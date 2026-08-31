import { nativeImage } from 'electron';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { BehaviorsFile, CharacterDefinition, EmotionsFile, InstalledCharacter, PackManifest, ValidationIssue, ValidationReport } from '../shared/types';
import { RUNTIME_VERSION, issue, resolvePackSchemaVersion, sortIssues, validateSemantics } from '../shared/validation';
import { auditArchiveEntries } from '../shared/archive-audit';
import { getCozyKinPaths } from './paths';
import { SchemaValidator } from './schema-validator';

export const PACK_LIMITS = {
  zipBytes: 100 * 1024 * 1024,
  totalBytes: 250 * 1024 * 1024,
  singleFileBytes: 25 * 1024 * 1024,
  textFileBytes: 1024 * 1024,
  fileCount: 500,
  maxDepth: 8,
  totalCompressionRatio: 100
} as const;

const PACK_1_1_MINIMUM_RUNTIME = '0.2.0';

interface StagedPack {
  token: string;
  directory: string;
  manifest: PackManifest;
  character: CharacterDefinition;
  report: ValidationReport;
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Unable to open ZIP.'));
      else resolvePromise(zip);
    });
  });
}

function openEntryStream(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolvePromise, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error('Unable to read ZIP entry.'));
      else resolvePromise(stream);
    });
  });
}

function isDirectory(entry: Entry): boolean { return entry.fileName.endsWith('/'); }
function isSymlink(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

function safeDestination(root: string, path: string): string | null {
  const target = resolve(root, ...path.split('/'));
  const expectedPrefix = `${resolve(root)}${sep}`;
  return target.startsWith(expectedPrefix) ? target : null;
}

function readZipEntries(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolvePromise, reject) => {
    const entries: Entry[] = [];
    zip.on('entry', (entry: Entry) => { entries.push(entry); zip.readEntry(); });
    zip.once('error', reject);
    zip.once('end', () => resolvePromise(entries));
    zip.readEntry();
  });
}

function imageMagicMatches(buffer: Buffer, extension: string): boolean {
  if (extension === '.png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return true;
}

function validateImage(path: string, relativePath: string, manifest: PackManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return [issue('IMAGE_DECODE_FAILED', relativePath, 'decodable PNG or WebP', 'decoder returned empty image', 'The image cannot be decoded by CozyKin.', 'Re-export the image as a standard PNG or WebP.')];
  const size = image.getSize();
  const isPreview = relativePath === 'preview/thumbnail.png';
  if (!isPreview && (size.width !== manifest.canvas.width || size.height !== manifest.canvas.height)) {
    issues.push(issue('IMAGE_DIMENSION_MISMATCH', relativePath, `${manifest.canvas.width}x${manifest.canvas.height}`, `${size.width}x${size.height}`, 'Animation frame dimensions do not match manifest canvas.', 'Resize the frame without changing character scale or foot placement.'));
  }
  const bitmap = image.toBitmap();
  const alphas = bitmap.length >= 4 ? [bitmap[3], bitmap[Math.max(3, (size.width - 1) * 4 + 3)], bitmap[Math.max(3, (size.height - 1) * size.width * 4 + 3)], bitmap[Math.max(3, (size.width * size.height - 1) * 4 + 3)]] : [];
  if (!isPreview && (alphas.length !== 4 || alphas.some((alpha) => alpha === undefined || alpha > 32))) {
    issues.push(issue('TRANSPARENT_BACKGROUND_REQUIRED', relativePath, 'transparent canvas corners with alpha <= 32', alphas.join(','), 'The frame does not have a clearly transparent background.', 'Export the character on a transparent background with transparent corners.'));
  }
  if (!isPreview && bitmap.length >= size.width * size.height * 4) {
    let minX = size.width; let minY = size.height; let maxX = -1; let maxY = -1;
    for (let y = 0; y < size.height; y += 1) for (let x = 0; x < size.width; x += 1) {
      if (bitmap[(y * size.width + x) * 4 + 3]! <= 16) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const margin = Math.max(12, Math.round(Math.min(size.width, size.height) * 0.025));
    if (maxX < 0) issues.push(issue('IMAGE_HAS_NO_VISIBLE_CONTENT', relativePath, 'visible character pixels', 'fully transparent image', 'The animation frame is completely transparent.', 'Export the intended character artwork into this frame.'));
    else if (minX < margin || minY < margin || maxX >= size.width - margin || maxY >= size.height - margin) {
      issues.push(issue('IMAGE_CONTENT_NEAR_EDGE', relativePath, `at least ${margin}px transparent safe margin`, `visible bounds ${minX},${minY}–${maxX},${maxY}`, 'The character is too close to the canvas edge and may appear cropped while moving.', 'Scale or reposition the character so ears, paws, and tail keep a transparent safety margin.', '', 'warning'));
    }
  }
  return issues;
}

export class PackImporter {
  private readonly staged = new Map<string, StagedPack>();
  constructor(
    private readonly schemaRoot: string,
    private readonly removeBackup: (path: string) => Promise<void> = (path) => rm(path, { recursive: true, force: true })
  ) {}

  async validate(zipPath: string): Promise<ValidationReport> {
    const paths = getCozyKinPaths();
    await mkdir(paths.staging, { recursive: true });
    const token = randomUUID();
    const stagingDirectory = join(paths.staging, token);
    await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
    const issues: ValidationIssue[] = [];
    let manifest: PackManifest | undefined;
    let character: CharacterDefinition | undefined;
    try {
      const archiveStats = await stat(zipPath);
      if (archiveStats.size > PACK_LIMITS.zipBytes) issues.push(issue('ZIP_TOO_LARGE', '', `<= ${PACK_LIMITS.zipBytes} bytes`, String(archiveStats.size), 'The ZIP exceeds the maximum compressed size.', 'Remove unnecessary files or reduce asset dimensions.'));
      if (issues.length) return await this.finishFailure(stagingDirectory, issues);

      const zip = await openZip(zipPath);
      const entries = await readZipEntries(zip);
      const audit = auditArchiveEntries(entries.map((entry, index) => ({
        index, path: entry.fileName, directory: isDirectory(entry), symlink: isSymlink(entry),
        uncompressedSize: entry.uncompressedSize, compressedSize: entry.compressedSize,
        compressionMethod: entry.compressionMethod, encrypted: (entry.generalPurposeBitFlag & 1) !== 0
      })), PACK_LIMITS);
      issues.push(...audit.issues);
      const seen = audit.files;
      const safeEntries = audit.accepted.map(({ index, path }) => ({ entry: entries[index]!, path }));
      if (issues.some((entry) => entry.severity === 'error')) { zip.close(); return await this.finishFailure(stagingDirectory, issues); }

      for (const { entry, path } of safeEntries) {
        const destination = safeDestination(stagingDirectory, path);
        if (!destination) { issues.push(issue('UNSAFE_ARCHIVE_PATH', path, 'path inside staging directory', path, 'The extracted path escapes staging.', 'Use a safe relative path.')); continue; }
        await mkdir(join(destination, '..'), { recursive: true });
        const stream = await openEntryStream(zip, entry);
        await pipeline(stream, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
        const extension = extname(path).toLowerCase();
        if (extension === '.png' || extension === '.webp') {
          const header = (await readFile(destination)).subarray(0, 12);
          if (!imageMagicMatches(header, extension)) issues.push(issue('FILE_SIGNATURE_MISMATCH', path, extension.slice(1).toUpperCase(), 'different signature', 'File contents do not match the image extension.', 'Re-export the file in the declared format.'));
        }
      }
      zip.close();

      const parsed = new Map<string, unknown>();
      for (const jsonFile of ['manifest.json', 'character.json', 'behaviors.json', 'emotions.json']) {
        try { parsed.set(jsonFile, JSON.parse(await readFile(join(stagingDirectory, jsonFile), 'utf8')) as unknown); }
        catch (error) { issues.push(issue('JSON_PARSE_ERROR', jsonFile, 'valid JSON', error instanceof Error ? error.message : 'parse error', 'The JSON file cannot be parsed.', 'Correct JSON syntax and encoding.')); }
      }
      const rawManifest = parsed.get('manifest.json');
      const declaredVersion = rawManifest && typeof rawManifest === 'object' && !Array.isArray(rawManifest)
        ? (rawManifest as Record<string, unknown>).schemaVersion
        : undefined;
      const schemaVersion = resolvePackSchemaVersion(declaredVersion);
      if (!schemaVersion) {
        issues.push(issue(
          'UNSUPPORTED_SCHEMA_VERSION', 'manifest.json', 'supported Pack schema version (1.0 or 1.1)',
          typeof declaredVersion === 'string' ? declaredVersion : 'missing',
          'The pack declares an unsupported schema version.', 'Set schemaVersion to a supported CozyKin Pack version.', '/schemaVersion'
        ));
        return await this.finishFailure(stagingDirectory, issues);
      }
      const schemaValidator = new SchemaValidator(this.schemaRoot);
      await schemaValidator.initialize(schemaVersion);
      for (const [file, value] of parsed) issues.push(...schemaValidator.validate(file, value));
      if (issues.some((entry) => entry.severity === 'error')) return await this.finishFailure(stagingDirectory, issues);

      manifest = parsed.get('manifest.json') as PackManifest;
      character = parsed.get('character.json') as CharacterDefinition;
      const behaviors = parsed.get('behaviors.json') as BehaviorsFile;
      const emotions = parsed.get('emotions.json') as EmotionsFile;
      const minimum = semver.valid(manifest.runtimeCompatibility.minimumVersion);
      const requiresPack11Runtime = schemaVersion === '1.1' && (!minimum || semver.lt(minimum, PACK_1_1_MINIMUM_RUNTIME));
      if (!minimum || semver.gt(minimum, RUNTIME_VERSION) || requiresPack11Runtime) {
        const expected = schemaVersion === '1.1'
          ? `minimumVersion >= ${PACK_1_1_MINIMUM_RUNTIME} and <= ${RUNTIME_VERSION}`
          : `minimumVersion <= ${RUNTIME_VERSION}`;
        const message = requiresPack11Runtime
          ? `Pack 1.1 requires CozyKin Runtime ${PACK_1_1_MINIMUM_RUNTIME} or newer.`
          : 'This pack requires a newer CozyKin Runtime.';
        const suggestedFix = requiresPack11Runtime
          ? `Set minimumVersion to ${PACK_1_1_MINIMUM_RUNTIME} or newer.`
          : 'Lower the minimum only if the pack uses no newer features, or update CozyKin.';
        issues.push(issue('INCOMPATIBLE_RUNTIME_VERSION', 'manifest.json', expected, manifest.runtimeCompatibility.minimumVersion, message, suggestedFix, '/runtimeCompatibility/minimumVersion'));
      }
      issues.push(...validateSemantics(manifest, character, behaviors, emotions, seen));
      for (const file of seen) {
        const extension = extname(file).toLowerCase();
        if (extension === '.png' || extension === '.webp') issues.push(...validateImage(join(stagingDirectory, file), file, manifest));
      }
      const report: ValidationReport = { schemaVersion: '1.0', valid: !issues.some((entry) => entry.severity === 'error'), packageId: manifest.packageId, displayName: manifest.displayName, issues: sortIssues(issues) };
      if (!report.valid) return await this.finishFailure(stagingDirectory, issues, manifest);
      const preview = await readFile(join(stagingDirectory, 'preview', 'thumbnail.png'));
      report.previewDataUrl = `data:image/png;base64,${preview.toString('base64')}`;
      report.stagingToken = token;
      this.staged.set(token, { token, directory: stagingDirectory, manifest, character, report });
      return report;
    } catch (error) {
      issues.push(issue('ZIP_PROCESSING_FAILED', '', 'readable valid ZIP', error instanceof Error ? error.message : 'unknown error', 'CozyKin could not safely process the ZIP.', 'Recreate the ZIP with a standard ZIP tool and retry.'));
      return await this.finishFailure(stagingDirectory, issues, manifest);
    }
  }

  private async finishFailure(directory: string, issues: ValidationIssue[], manifest?: PackManifest): Promise<ValidationReport> {
    await rm(directory, { recursive: true, force: true });
    return { schemaVersion: '1.0', valid: false, ...(manifest ? { packageId: manifest.packageId, displayName: manifest.displayName } : {}), issues: sortIssues(issues) };
  }

  async install(token: string, replaceExisting: boolean): Promise<InstalledCharacter> {
    const staged = this.staged.get(token);
    if (!staged) throw new Error('The validated staging token is missing or expired. Validate the ZIP again.');
    const destination = join(getCozyKinPaths().characters, staged.manifest.packageId);
    const backup = `${destination}.backup-${randomUUID()}`;
    await mkdir(getCozyKinPaths().characters, { recursive: true });
    let existing = false;
    try { await stat(destination); existing = true; } catch { existing = false; }
    if (existing && !replaceExisting) throw new Error('A character with this packageId is already installed.');
    if (existing) await rename(destination, backup);
    try {
      await rename(staged.directory, destination);
    } catch (error) {
      try { if (existing) await rename(backup, destination); } catch { /* preserve original error */ }
      throw error;
    }
    this.staged.delete(token);
    if (existing) {
      try { await this.removeBackup(backup); } catch { /* replacement is already committed; keep the recoverable backup */ }
    }
    return { packageId: staged.manifest.packageId, displayName: staged.manifest.displayName, characterType: staged.manifest.characterType, thumbnailUrl: pathToFileURL(join(destination, 'preview', 'thumbnail.png')).href, active: false, builtIn: false };
  }

  async cleanup(): Promise<void> {
    this.staged.clear();
    await rm(getCozyKinPaths().staging, { recursive: true, force: true });
  }
}
