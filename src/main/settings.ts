import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AppSettings } from '../shared/types';
import { getCozyKinPaths } from './paths';
import { createSerialTaskQueue } from './serial-task-queue';

const enqueueSettingsWrite = createSerialTaskQueue();
let temporarySequence = 0;

export const DEFAULT_SETTINGS: AppSettings = {
  scale: 0.75,
  opacity: 1,
  alwaysOnTop: true,
  edgeHideEnabled: true,
  activeCharacterId: 'cozykin-cookie',
  windowPosition: null
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  const position = merged.windowPosition;
  return {
    scale: clamp(merged.scale, 0.4, 1.5, DEFAULT_SETTINGS.scale),
    opacity: clamp(merged.opacity, 0.2, 1, DEFAULT_SETTINGS.opacity),
    alwaysOnTop: Boolean(merged.alwaysOnTop),
    edgeHideEnabled: Boolean(merged.edgeHideEnabled),
    activeCharacterId: typeof merged.activeCharacterId === 'string' && merged.activeCharacterId ? merged.activeCharacterId : DEFAULT_SETTINGS.activeCharacterId,
    windowPosition: position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? { x: Math.round(position.x), y: Math.round(position.y) }
      : null
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const parsed = JSON.parse(await readFile(getCozyKinPaths().settings, 'utf8')) as Partial<AppSettings>;
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const path = getCozyKinPaths().settings;
  const serialized = `${JSON.stringify(settings, null, 2)}\n`;
  return enqueueSettingsWrite(async () => {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${temporarySequence++}`;
    try {
      await writeFile(temporary, serialized, { mode: 0o600 });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  });
}
