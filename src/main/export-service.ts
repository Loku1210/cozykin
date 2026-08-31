import { clipboard, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { CharacterBrief, ValidationReport } from '../shared/types';

function safeName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'cozykin-character';
}

export async function exportPrompt(brief: CharacterBrief, markdown: string): Promise<{ path?: string; canceled: boolean }> {
  const result = await dialog.showSaveDialog({ title: 'Export Agent Prompt', defaultPath: `${safeName(brief.displayName)}-agent-prompt.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  await writeFile(result.filePath, markdown.replace(/\r\n?/g, '\n'), { encoding: 'utf8', mode: 0o600 });
  return { canceled: false, path: result.filePath };
}

export async function exportBrief(brief: CharacterBrief): Promise<{ path?: string; canceled: boolean }> {
  const result = await dialog.showSaveDialog({ title: 'Save Character Brief', defaultPath: `${safeName(brief.displayName)}-character-brief.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  await writeFile(result.filePath, `${JSON.stringify(brief, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { canceled: false, path: result.filePath };
}

export async function exportReport(report: ValidationReport): Promise<{ path?: string; canceled: boolean }> {
  const result = await dialog.showSaveDialog({ title: 'Export Validation Report', defaultPath: 'cozykin-validation-report.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  const safeReport = { ...report, previewDataUrl: undefined, stagingToken: undefined };
  await writeFile(result.filePath, `${JSON.stringify(safeReport, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { canceled: false, path: result.filePath };
}

export function copyText(text: unknown): void {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('Clipboard text is invalid or too large.');
  clipboard.writeText(text);
}
