import { app } from 'electron';
import { join } from 'node:path';

export interface CozyKinPaths {
  root: string;
  characters: string;
  briefs: string;
  reports: string;
  dialogues: string;
  staging: string;
  settings: string;
}

export function getCozyKinPaths(): CozyKinPaths {
  const root = join(app.getPath('userData'), 'CozyKin');
  return {
    root,
    characters: join(root, 'characters'),
    briefs: join(root, 'briefs'),
    reports: join(root, 'reports'),
    dialogues: join(root, 'dialogues'),
    staging: join(root, '.staging'),
    settings: join(root, 'settings.json')
  };
}

export function rendererFile(name: 'runtime.html' | 'studio.html'): string {
  return join(app.getAppPath(), 'dist-renderer', name);
}

export function bundledExamplePath(...parts: string[]): string {
  const examplesRoot = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'examples')
    : join(app.getAppPath(), 'examples');
  return join(examplesRoot, ...parts);
}

export function bundledBrandPath(...parts: string[]): string {
  return join(app.getAppPath(), 'brand', ...parts);
}
