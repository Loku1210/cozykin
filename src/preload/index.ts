import { contextBridge, ipcRenderer } from 'electron';
import type { CozyKinApi } from '../shared/ipc';

const api: CozyKinApi = {
  openStudio: () => ipcRenderer.invoke('app:open-studio'),
  hideCompanion: () => ipcRenderer.invoke('app:hide-companion'),
  quit: () => ipcRenderer.invoke('app:quit'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getActiveCharacter: () => ipcRenderer.invoke('characters:active'),
  listCharacters: () => ipcRenderer.invoke('characters:list'),
  activateCharacter: (packageId) => ipcRenderer.invoke('characters:activate', packageId),
  deleteCharacter: (packageId) => ipcRenderer.invoke('characters:delete', packageId),
  getDialogues: (packageId) => ipcRenderer.invoke('dialogues:get', packageId),
  saveDialogues: (packageId, dialogues) => ipcRenderer.invoke('dialogues:save', packageId, dialogues),
  chooseAndValidatePack: () => ipcRenderer.invoke('pack:choose-validate'),
  installValidatedPack: (stagingToken, replace, responsibilityAccepted) => ipcRenderer.invoke('pack:install', stagingToken, replace, responsibilityAccepted),
  exportPrompt: (brief, markdown) => ipcRenderer.invoke('export:prompt', brief, markdown),
  saveBrief: (brief) => ipcRenderer.invoke('export:brief', brief),
  exportReport: (report) => ipcRenderer.invoke('export:report', report),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  endDrag: () => ipcRenderer.send('runtime:drag-end'),
  moveWindow: (dx, dy) => ipcRenderer.send('runtime:move-window', dx, dy),
  resizeCompanion: (width, height, anchor, constrainToWorkArea) => ipcRenderer.send('runtime:resize', width, height, anchor, constrainToWorkArea),
  setMousePassthrough: (ignore) => ipcRenderer.send('runtime:mouse-passthrough', ignore),
  getRuntimeBounds: () => ipcRenderer.invoke('runtime:bounds'),
  resetRuntimePosition: () => ipcRenderer.invoke('runtime:reset-position'),
  onCharacterChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('characters:changed', handler);
    return () => ipcRenderer.removeListener('characters:changed', handler);
  }
};

contextBridge.exposeInMainWorld('cozykin', api);
