import { listPackage } from '@electron/asar';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const releaseRoot = join(process.cwd(), 'release');
const forbiddenBrandBytes = [Buffer.from('mojocarrot', 'utf8'), Buffer.from('mojo carrot', 'utf8'), Buffer.from('stayreal', 'utf8')];
const allowedExampleExtensions = new Set(['.json', '.png', '.webp', '.md', '.txt']);
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const rel = relative(releaseRoot, path).split('\\').join('/');
    if (/mojo\s*carrot|mojocarrot|stayreal/iu.test(rel)) findings.push(`${rel}: forbidden release filename`);
    if (entry.isDirectory()) await walk(path);
    else if (rel.includes('/app.asar.unpacked/examples/')) {
      const extension = extname(path).toLowerCase();
      if (!allowedExampleExtensions.has(extension)) findings.push(`${rel}: forbidden unpacked example-pack extension`);
      if (['.json', '.md', '.txt'].includes(extension)) {
        const lower = (await readFile(path, 'utf8')).toLowerCase();
        for (const needle of forbiddenBrandBytes) if (lower.includes(needle.toString('utf8'))) findings.push(`${rel}: forbidden brand text`);
      }
    } else if (entry.name === 'app.asar') {
      const entries = listPackage(path).map((value) => value.replace(/^\//, ''));
      for (const packedPath of entries) {
        if (/mojo\s*carrot|mojocarrot|stayreal/iu.test(packedPath)) findings.push(`${rel}:${packedPath}: forbidden packed filename`);
        if (packedPath.startsWith('examples/') && extname(packedPath) && !allowedExampleExtensions.has(extname(packedPath).toLowerCase())) findings.push(`${rel}:${packedPath}: forbidden example-pack extension`);
      }
      const bytes = await readFile(path);
      const lower = Buffer.from(bytes.toString('latin1').toLowerCase(), 'latin1');
      for (const needle of forbiddenBrandBytes) if (lower.includes(needle)) findings.push(`${rel}: forbidden brand bytes`);
    }
  }
}

try { await walk(releaseRoot); }
catch (error) {
  console.error(`Release audit could not read ${releaseRoot}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (findings.length) {
  console.error(`Release audit failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('Release audit passed: packaged app contains no legacy brand strings and example packs contain only allowed data formats.');
