import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release documentation truth', () => {
  it('states platform, signing, Windows verification, and Pack responsibility limits', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const status = readFileSync(new URL('../RELEASE_STATUS.md', import.meta.url), 'utf8');
    for (const expected of ['macOS arm64', 'Windows x64', '未签名', '未公证', 'Windows 真机']) {
      expect(`${readme}\n${status}`).toContain(expected);
    }
    expect(readme).toContain('Pack 内容与素材权利由导入者负责');
    expect(status).toContain('结构验证');
    expect(status).toContain('audit:release');
  });

  it('builds ignored example archives before clean-clone importer verification', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.verify).toContain('npm run examples:zip && npm run test:importer');
  });
});
