import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const studio = readFileSync(new URL('../src/renderer/studio.tsx', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../src/renderer/responsibility-gate.tsx', import.meta.url), 'utf8');

describe('first-run and Pack workflow copy', () => {
  it('explains the local boundary and complete handoff workflow', () => {
    expect(studio).toContain('所有草稿、角色包和对白默认留在本机');
    expect(studio).toContain('生成 Prompt → 交给你选择的 Agent → 导入 ZIP → 检查报告 → 确认责任 → 安装');
  });

  it('gives an actionable next step for both valid and invalid validation reports', () => {
    expect(studio).toContain('先按下方 Fix 修复全部错误');
    expect(studio).toContain('先核对预览、角色名称和验证报告');
    expect(studio).toContain('同一 packageId 已安装');
  });

  it('states that acknowledgement is Pack-specific and reset on replacement input', () => {
    expect(gate).toContain('只对当前这一个已验证 Pack 有效');
    expect(gate).toContain('更换角色包');
  });
});
