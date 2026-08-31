const { app } = require('electron');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const temporaryUserData = mkdtempSync(join(tmpdir(), 'cozykin-importer-smoke-'));
app.setPath('userData', temporaryUserData);

app.whenReady().then(async () => {
  const { PackImporter } = require('../dist-main/main/pack-importer.js');
  const importer = new PackImporter(resolve('schemas'));
  let failed = false;
  for (const archive of process.argv.slice(2)) {
    const report = await importer.validate(resolve(archive));
    console.log(`${archive}: ${report.valid ? 'valid' : 'invalid'} (${report.issues.length} issues)`);
    if (!report.valid) {
      failed = true;
      for (const issue of report.issues) console.error(`${issue.errorCode} ${issue.file} ${issue.message}`);
    }
  }
  await importer.cleanup();
  rmSync(temporaryUserData, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
}).catch((error) => {
  console.error(error);
  rmSync(temporaryUserData, { recursive: true, force: true });
  app.exit(1);
});
