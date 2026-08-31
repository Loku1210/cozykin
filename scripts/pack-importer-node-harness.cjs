// Fallback only when the real Electron binary aborts before app.whenReady().
// Exercises the compiled PackImporter on final ZIPs with a PNGJS nativeImage shim.
const Module = require('node:module');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { PNG } = require('pngjs');

const harnessUserData = mkdtempSync(join(tmpdir(), 'cozykin-importer-node-harness-'));
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request !== 'electron') return originalLoad.call(this, request, parent, isMain);
  return {
    app: { getPath: () => harnessUserData, getAppPath: () => process.cwd(), isPackaged: false },
    nativeImage: {
      createFromPath(path) {
        try {
          const png = PNG.sync.read(readFileSync(path));
          return { isEmpty: () => false, getSize: () => ({ width: png.width, height: png.height }), toBitmap: () => png.data };
        } catch {
          return { isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) };
        }
      }
    }
  };
};

(async () => {
  const { PackImporter } = require('../dist-main/main/pack-importer.js');
  const importer = new PackImporter(resolve('schemas'));
  let failed = false;
  for (const archive of process.argv.slice(2)) {
    const report = await importer.validate(resolve(archive));
    console.log(`${archive}: ${report.valid ? 'valid' : 'invalid'} (${report.issues.length} issues; node fallback harness)`);
    if (!report.valid) failed = true;
  }
  await importer.cleanup();
  rmSync(harnessUserData, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
})().catch((error) => {
  console.error(error);
  rmSync(harnessUserData, { recursive: true, force: true });
  process.exitCode = 1;
});
