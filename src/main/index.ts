import { app, dialog, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { companionResizeBounds } from '../shared/runtime-state';
import type { AppSettings } from '../shared/types';
import { loadSettings, sanitizeSettings, saveSettings } from './settings';
import { clampBoundsToWorkArea, createCompanionWindow, createTray, getCompanionWindow, showStudio } from './windows';
import { CharacterLibrary } from './character-library';
import { copyText, exportBrief, exportPrompt, exportReport } from './export-service';
import { PackImporter } from './pack-importer';
import { installPackWithResponsibility } from './pack-install-handler';
import { loadDialogues, saveDialogues } from './dialogue-store';

let settings: AppSettings;
const library = new CharacterLibrary();
let importer: PackImporter;

function registerBaseIpc(): void {
  ipcMain.handle('app:open-studio', () => { showStudio(); });
  ipcMain.handle('app:hide-companion', () => { getCompanionWindow()?.hide(); });
  ipcMain.handle('app:quit', () => { (app as typeof app & { isQuitting?: boolean }).isQuitting = true; app.quit(); });
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:save', async (_event, partial: Partial<AppSettings>) => {
    settings = sanitizeSettings({ ...settings, ...partial });
    getCompanionWindow()?.setAlwaysOnTop(settings.alwaysOnTop);
    await saveSettings(settings);
    return settings;
  });
  ipcMain.handle('characters:list', () => library.list(settings.activeCharacterId));
  ipcMain.handle('characters:active', async () => {
    if (!(await library.exists(settings.activeCharacterId))) {
      const list = await library.list(settings.activeCharacterId);
      if (!list[0]) throw new Error('No character is installed. Open Character Studio to import a CozyKin Pack.');
      settings = sanitizeSettings({ ...settings, activeCharacterId: list[0].packageId });
      await saveSettings(settings);
    }
    return library.load(settings.activeCharacterId);
  });
  ipcMain.handle('characters:activate', async (_event, packageId: string) => {
    if (!(await library.exists(packageId))) throw new Error('Character not found.');
    settings = sanitizeSettings({ ...settings, activeCharacterId: packageId });
    await saveSettings(settings);
    for (const window of [getCompanionWindow()]) window?.webContents.send('characters:changed');
  });
  ipcMain.handle('characters:delete', (_event, packageId: string) => library.delete(packageId, settings.activeCharacterId));
  ipcMain.handle('dialogues:get', async (_event, packageId: string) => {
    const runtime = await library.load(packageId);
    return loadDialogues(packageId, runtime.character);
  });
  ipcMain.handle('dialogues:save', (_event, packageId: string, dialogues) => saveDialogues(packageId, dialogues));
  ipcMain.handle('pack:choose-validate', async () => {
    const result = await dialog.showOpenDialog({ title: 'Choose CozyKin Pack', properties: ['openFile'], filters: [{ name: 'CozyKin ZIP', extensions: ['zip'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    return importer.validate(result.filePaths[0]);
  });
  ipcMain.handle('pack:install', async (_event, token: string, replace: boolean, responsibilityAccepted: unknown) => {
    const installed = await installPackWithResponsibility(importer, token, replace, responsibilityAccepted);
    if (!(await library.exists(settings.activeCharacterId))) {
      settings = sanitizeSettings({ ...settings, activeCharacterId: installed.packageId });
      await saveSettings(settings);
    }
    getCompanionWindow()?.webContents.send('characters:changed');
    return installed;
  });
  ipcMain.handle('export:prompt', (_event, brief, markdown) => exportPrompt(brief, markdown));
  ipcMain.handle('export:brief', (_event, brief) => exportBrief(brief));
  ipcMain.handle('export:report', (_event, report) => exportReport(report));
  ipcMain.handle('clipboard:write', (_event, text) => copyText(text));
  ipcMain.on('runtime:drag-end', async () => {
    const [x = 0, y = 0] = getCompanionWindow()?.getPosition() ?? [0, 0];
    settings = sanitizeSettings({ ...settings, windowPosition: { x, y } });
    await saveSettings(settings);
  });
  ipcMain.on('runtime:move-window', (_event, dx: number, dy: number) => {
    const window = getCompanionWindow();
    if (!window) return;
    const safeDx = Math.max(-2000, Math.min(2000, Number(dx) || 0));
    const safeDy = Math.max(-2000, Math.min(2000, Number(dy) || 0));
    const [x = 0, y = 0] = window.getPosition();
    window.setPosition(Math.round(x + safeDx), Math.round(y + safeDy));
  });
  ipcMain.on('runtime:resize', (_event, width: number, height: number, anchor: 'center' | 'left' = 'center', constrainToWorkArea = true) => {
    const window = getCompanionWindow();
    if (!window) return;
    const bounds = window.getBounds();
    const nextWidth = Math.round(Math.max(250, Math.min(1200, Number(width) || 420)));
    const nextHeight = Math.round(Math.max(250, Math.min(1000, Number(height) || 420)));
    const requestedBounds = companionResizeBounds(bounds, { width: nextWidth, height: nextHeight }, anchor);
    const nextBounds = constrainToWorkArea === false
      ? requestedBounds
      : clampBoundsToWorkArea(requestedBounds, screen.getDisplayMatching(requestedBounds).workArea);
    if (bounds.x !== nextBounds.x || bounds.y !== nextBounds.y || bounds.width !== nextBounds.width || bounds.height !== nextBounds.height) {
      window.setBounds(nextBounds);
    }
  });
  ipcMain.on('runtime:mouse-passthrough', (_event, ignore: boolean) => {
    getCompanionWindow()?.setIgnoreMouseEvents(Boolean(ignore), ignore ? { forward: true } : undefined);
  });
  ipcMain.handle('runtime:bounds', () => {
    const window = getCompanionWindow();
    const bounds = window?.getBounds() ?? { x: 0, y: 0, width: 420, height: 420 };
    const workArea = screen.getDisplayMatching(bounds).workArea;
    return { window: bounds, workArea };
  });
  ipcMain.handle('runtime:reset-position', async () => {
    const window = getCompanionWindow();
    if (!window) return;
    const workArea = screen.getPrimaryDisplay().workArea;
    const bounds = window.getBounds();
    const x = workArea.x + workArea.width - bounds.width - 24;
    const y = workArea.y + workArea.height - bounds.height - 24;
    window.setPosition(x, y);
    settings = sanitizeSettings({ ...settings, windowPosition: { x, y } });
    await saveSettings(settings);
  });
}

void app.whenReady().then(async () => {
  app.setName('CozyKin');
  settings = await loadSettings();
  await library.initialize();
  importer = new PackImporter(join(app.getAppPath(), 'schemas'));
  registerBaseIpc();
  createCompanionWindow(settings);
  createTray();
  if (process.platform === 'darwin') app.dock?.hide();
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('CozyKin initialization failed:', error);
  dialog.showErrorBox('CozyKin could not start', `Local runtime initialization failed.\n\n${message}`);
  (app as typeof app & { isQuitting?: boolean }).isQuitting = true;
  app.quit();
});

app.on('activate', () => {
  if (!getCompanionWindow()) createCompanionWindow(settings);
  else getCompanionWindow()?.showInactive();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  (app as typeof app & { isQuitting?: boolean }).isQuitting = true;
  void importer?.cleanup();
});
