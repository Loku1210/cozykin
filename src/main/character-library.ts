import { cp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BehaviorsFile, CharacterDefinition, EmotionsFile, InstalledCharacter, PackManifest, RuntimeCharacter } from '../shared/types';
import { BUNDLED_CHARACTER_DIRS, BUNDLED_CHARACTER_DISPLAY_NAMES, BUNDLED_PACKAGE_IDS, REQUIRED_BUNDLED_CHARACTER_DIRS } from '../shared/bundled-characters';
import { bundledExamplePath, getCozyKinPaths } from './paths';

async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }

async function assertCompleteBundledSource(source: string): Promise<void> {
  await readJson<CharacterDefinition>(join(source, 'character.json'));
  const behaviors = await readJson<BehaviorsFile>(join(source, 'behaviors.json'));
  await readJson<EmotionsFile>(join(source, 'emotions.json'));
  const requiredFiles = new Set(['preview/thumbnail.png', ...behaviors.behaviors.flatMap((behavior) => behavior.frames)]);
  for (const file of requiredFiles) {
    const details = await stat(join(source, file));
    if (!details.isFile() || details.size === 0) throw new Error(`required bundled Pack file "${file}" is missing or empty`);
  }
}

const bundledDisplayOrder = new Map(BUNDLED_CHARACTER_DIRS.map((directory, index) => [`cozykin-${directory}`, index]));

export class CharacterLibrary {
  private initialized = false;
  private readonly availableBundledPackageIds = new Set<string>();

  constructor(
    private readonly removeCommittedBackup: (path: string) => Promise<void> = (path) => rm(path, { recursive: true, force: true })
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(getCozyKinPaths().characters, { recursive: true });
    const bundledPackageIds = new Set<string>();
    const bundledDisplayNames = new Set<string>();
    for (const id of BUNDLED_CHARACTER_DIRS) {
      // Node's recursive fs.cp cannot enumerate a directory inside app.asar;
      // packaged examples are read from electron-builder's unpacked tree.
      const source = bundledExamplePath(id);
      let manifest: PackManifest;
      try {
        manifest = await readJson<PackManifest>(join(source, 'manifest.json'));
      } catch (error) {
        if (!REQUIRED_BUNDLED_CHARACTER_DIRS.has(id)) continue;
        throw new Error(`Required bundled character "${id}" manifest could not be read at ${source}.`, { cause: error });
      }
      try {
        await assertCompleteBundledSource(source);
      } catch (error) {
        if (!REQUIRED_BUNDLED_CHARACTER_DIRS.has(id)) continue;
        throw new Error(`Required bundled character "${id}" Pack source is incomplete at ${source}.`, { cause: error });
      }
      if (bundledPackageIds.has(manifest.packageId)) throw new Error('Bundled character packageId must be unique.');
      if (bundledDisplayNames.has(manifest.displayName)) throw new Error('Bundled character displayName must be unique.');
      if (manifest.packageId !== `cozykin-${id}`) throw new Error(`Bundled character "${id}" has an unexpected packageId.`);
      if (manifest.displayName !== BUNDLED_CHARACTER_DISPLAY_NAMES.get(id)) throw new Error(`Bundled character "${id}" has an unexpected displayName.`);
      bundledPackageIds.add(manifest.packageId);
      bundledDisplayNames.add(manifest.displayName);
      const destination = join(getCozyKinPaths().characters, manifest.packageId);
      const staging = `${destination}.bundled-update`;
      const backup = `${destination}.bundled-backup`;
      await rm(staging, { recursive: true, force: true });
      await rm(backup, { recursive: true, force: true });
      await cp(source, staging, { recursive: true, errorOnExist: true });
      const hadExisting = await this.rawExists(manifest.packageId);
      if (hadExisting) await rename(destination, backup);
      try {
        await rename(staging, destination);
      } catch (error) {
        try { if (hadExisting) await rename(backup, destination); } catch { /* preserve original error */ }
        throw error;
      }
      this.availableBundledPackageIds.add(manifest.packageId);
      if (hadExisting) {
        try { await this.removeCommittedBackup(backup); } catch { /* refresh is committed; keep the recoverable backup */ }
      }
    }
    this.initialized = true;
  }

  async list(activeId: string): Promise<InstalledCharacter[]> {
    await this.initialize();
    const entries = await readdir(getCozyKinPaths().characters, { withFileTypes: true });
    const characters: InstalledCharacter[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (!entry.isDirectory() || entry.name.includes('.backup-') || entry.name.endsWith('.bundled-backup') || entry.name.endsWith('.bundled-update')) continue;
      try {
        const manifest = await readJson<PackManifest>(join(getCozyKinPaths().characters, entry.name, 'manifest.json'));
        if (BUNDLED_PACKAGE_IDS.has(manifest.packageId) && !this.availableBundledPackageIds.has(manifest.packageId)) continue;
        characters.push({ packageId: manifest.packageId, displayName: manifest.displayName, characterType: manifest.characterType, thumbnailUrl: pathToFileURL(join(getCozyKinPaths().characters, entry.name, 'preview', 'thumbnail.png')).href, active: manifest.packageId === activeId, builtIn: BUNDLED_PACKAGE_IDS.has(manifest.packageId) });
      } catch { /* Ignore corrupted directories; importer never creates them. */ }
    }
    characters.sort((left, right) => {
      const leftOrder = bundledDisplayOrder.get(left.packageId);
      const rightOrder = bundledDisplayOrder.get(right.packageId);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.packageId.localeCompare(right.packageId, 'en');
    });
    return characters;
  }

  async load(packageId: string): Promise<RuntimeCharacter> {
    await this.initialize();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(packageId)) throw new Error('Invalid packageId.');
    if (BUNDLED_PACKAGE_IDS.has(packageId) && !this.availableBundledPackageIds.has(packageId)) throw new Error(`Bundled character "${packageId}" is not available in this application build.`);
    const directory = join(getCozyKinPaths().characters, packageId);
    const resolved = `${directory}${sep}`;
    if (!resolved.startsWith(`${getCozyKinPaths().characters}${sep}`)) throw new Error('Unsafe character path.');
    return {
      manifest: await readJson<PackManifest>(join(directory, 'manifest.json')),
      character: await readJson<CharacterDefinition>(join(directory, 'character.json')),
      behaviors: await readJson<BehaviorsFile>(join(directory, 'behaviors.json')),
      emotions: await readJson<EmotionsFile>(join(directory, 'emotions.json')),
      assetBaseUrl: pathToFileURL(`${directory}${sep}`).href
    };
  }

  private async rawExists(packageId: string): Promise<boolean> { try { await stat(join(getCozyKinPaths().characters, packageId)); return true; } catch { return false; } }

  async exists(packageId: string): Promise<boolean> {
    await this.initialize();
    if (BUNDLED_PACKAGE_IDS.has(packageId) && !this.availableBundledPackageIds.has(packageId)) return false;
    return this.rawExists(packageId);
  }

  async delete(packageId: string, activeId: string): Promise<{ deleted: boolean; reason?: string }> {
    if (packageId === activeId) return { deleted: false, reason: 'Switch to another character before deleting the active character.' };
    if (BUNDLED_PACKAGE_IDS.has(packageId)) return { deleted: false, reason: 'Bundled example characters cannot be deleted.' };
    if (!(await this.exists(packageId))) return { deleted: false, reason: 'Character not found.' };
    await rm(join(getCozyKinPaths().characters, packageId), { recursive: true, force: false });
    return { deleted: true };
  }
}
