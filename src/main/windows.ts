import { BrowserWindow, Menu, Tray, app, nativeImage, screen } from 'electron';
import { join } from 'node:path';
import type { AppSettings } from '../shared/types';
import { bundledBrandPath, rendererFile } from './paths';

let companionWindow: BrowserWindow | null = null;
let studioWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const securePreferences = {
  preload: join(__dirname, '..', 'preload', 'index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
} as const;

export function getCompanionWindow(): BrowserWindow | null { return companionWindow; }

export function clampBoundsToWorkArea(bounds: Electron.Rectangle, workArea: Electron.Rectangle): Electron.Rectangle {
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + Math.max(0, workArea.width - bounds.width)),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + Math.max(0, workArea.height - bounds.height))
  };
}

export function keepCompanionVisible(): void {
  if (!companionWindow) return;
  const bounds = companionWindow.getBounds();
  companionWindow.setBounds(clampBoundsToWorkArea(bounds, screen.getDisplayMatching(bounds).workArea));
}

export function createCompanionWindow(settings: AppSettings): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea;
  const saved = settings.windowPosition;
  const initialBounds = clampBoundsToWorkArea({
    width: 420,
    height: 420,
    x: saved?.x ?? workArea.x + workArea.width - 400,
    y: saved?.y ?? workArea.y + workArea.height - 380
  }, screen.getDisplayMatching({ x: saved?.x ?? workArea.x, y: saved?.y ?? workArea.y, width: 420, height: 420 }).workArea);
  companionWindow = new BrowserWindow({
    ...initialBounds,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    webPreferences: securePreferences
  });
  companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void companionWindow.loadFile(rendererFile('runtime.html'));
  companionWindow.once('ready-to-show', () => companionWindow?.showInactive());
  companionWindow.on('close', (event) => {
    if (!(app as typeof app & { isQuitting?: boolean }).isQuitting) {
      event.preventDefault();
      companionWindow?.hide();
    }
  });
  return companionWindow;
}

export function showStudio(): BrowserWindow {
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.show();
    studioWindow.focus();
    return studioWindow;
  }
  studioWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: 'CozyKin — Personal Desktop Companion Studio',
    backgroundColor: '#f4f6fb',
    webPreferences: securePreferences
  });
  void studioWindow.loadFile(rendererFile('studio.html'));
  studioWindow.on('closed', () => { studioWindow = null; });
  return studioWindow;
}

export function createTray(): void {
  const source = bundledBrandPath('cozykin-tray.png');
  const loaded = nativeImage.createFromPath(source);
  const trayImage = loaded.isEmpty() ? nativeImage.createEmpty() : loaded.resize({ width: 18, height: 18 });
  tray = new Tray(trayImage);
  tray.setToolTip('CozyKin');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示伙伴', click: () => companionWindow?.showInactive() },
    { label: '打开 Character Studio', click: () => showStudio() },
    { type: 'separator' },
    { label: '退出 CozyKin', click: () => { (app as typeof app & { isQuitting?: boolean }).isQuitting = true; app.quit(); } }
  ]));
}
