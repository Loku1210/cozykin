import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const excluded = new Set(['.git', 'node_modules', 'tmp', 'coverage', 'release']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.css', '.yml', '.yaml']);
const forbidden = /mojo\s*carrot|mojocarrot|stayreal|五月天|相信音乐|阿信|卜卜/iu;
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    const rel = relative(root, path).split('\\').join('/');
    const allowedRecord = rel === 'docs/MIGRATION_FROM_MOJOCARROT.md' || rel === 'scripts/brand-audit.mjs' || rel === 'scripts/release-audit.mjs';
    if (forbidden.test(entry.name) && !allowedRecord) findings.push(`${rel}: forbidden filename`);
    if (entry.isDirectory()) await walk(path);
    else if (textExtensions.has(extname(entry.name).toLowerCase()) && !allowedRecord) {
      const text = await readFile(path, 'utf8');
      text.split(/\r?\n/).forEach((line, index) => { if (forbidden.test(line)) findings.push(`${rel}:${index + 1}: ${line.trim()}`); });
    }
  }
}

await walk(root);
if (findings.length) {
  console.error(`Brand audit failed:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else console.log('Brand audit passed: no legacy brand or character references outside the migration record.');
