import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CharacterDefinition, DialogueCategory, DialogueConfig } from '../shared/types';
import { getCozyKinPaths } from './paths';
import { createSerialTaskQueue } from './serial-task-queue';

const CATEGORIES: DialogueCategory[] = ['click', 'doubleClick', 'rapidClick', 'hiss', 'drag', 'sleep', 'wake', 'wander'];
const enqueueDialogueWrite = createSerialTaskQueue();
let temporarySequence = 0;

export const DEFAULT_DIALOGUES: DialogueConfig = {
  click: ['喵～', 'purrr～', '我在这里。'],
  doubleClick: ['好开心！', '再摸摸我～'],
  rapidClick: ['呜哇！慢一点！', '再点两下我就要生气了！'],
  hiss: ['哈——！', '不许再戳啦！'],
  drag: ['轻一点呀～', '要带我去哪里？'],
  sleep: ['呼……zzZZ'],
  wake: ['唔，醒来啦。'],
  wander: ['去那边看看。']
};

function safePackageId(packageId: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(packageId)) throw new Error('Invalid packageId.');
  return packageId;
}

export function sanitizeDialogues(value: unknown, fallback: Partial<DialogueConfig> = {}): DialogueConfig {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(CATEGORIES.map((category) => {
    const selected = Array.isArray(source[category]) ? source[category] : fallback[category] ?? DEFAULT_DIALOGUES[category];
    const cleaned = [...new Set(selected.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
      .slice(0, 20).map((item) => item.slice(0, 120));
    return [category, cleaned.length ? cleaned : DEFAULT_DIALOGUES[category]];
  })) as DialogueConfig;
}

export async function loadDialogues(packageId: string, character: CharacterDefinition): Promise<DialogueConfig> {
  const path = join(getCozyKinPaths().dialogues, `${safePackageId(packageId)}.json`);
  try { return sanitizeDialogues(JSON.parse(await readFile(path, 'utf8')), character.dialogues); }
  catch { return sanitizeDialogues(character.dialogues); }
}

export async function saveDialogues(packageId: string, value: unknown): Promise<DialogueConfig> {
  const dialogues = sanitizeDialogues(value);
  const directory = getCozyKinPaths().dialogues;
  const path = join(directory, `${safePackageId(packageId)}.json`);
  return enqueueDialogueWrite(async () => {
    await mkdir(directory, { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${temporarySequence++}`;
    try {
      await writeFile(temporary, `${JSON.stringify(dialogues, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, path);
      return dialogues;
    } finally {
      await rm(temporary, { force: true });
    }
  });
}
