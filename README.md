# CozyKin

<p align="center"><b>English</b> · <a href="#简体中文">简体中文</a></p>

CozyKin is a desktop pet application with a DIY skin ecosystem. It ships two original
cat characters — **cookie** and **pudding** — and lets you bring your own emotional
companion skins by generating a self-contained character *Pack* with your own agent
and importing it through a safety-checked, responsibility-gated importer.

> Version 0.2.1. Code is MIT-licensed (see `LICENSE`); the original bundled character
> artwork and copy are under a separate non-commercial license (see `ARTWORK_LICENSE.md`).

## Features

- Desktop pet runtime for the two built-in identities (cookie / pudding), each in a
  standard and a front-facing variant.
- **Prompt Generator** (studio): pick personality/traits, get a deterministic,
  self-contained prompt you run with your own agent to produce a character Pack.
- **Safety-checked importer**: ZIP-slip protection, magic-byte checks, schema
  validation (Pack manifest **v1.1**, with v1.0 still accepted), image validation,
  and an install preview.
- **Responsibility gate**: importing a Pack requires an explicit, per-Pack checkbox —
  *"I am responsible for the generated character and will not distribute it
  commercially"* — that is unchecked by default, disables install until accepted,
  resets when you change or re-import a Pack, and is never persisted.

## Install (development)

Requirements: Node.js 20+.

```bash
npm ci
npm run build
npm start          # launch the desktop app
```

## Desktop candidates

- **macOS arm64**, **macOS universal** and **Windows x64** are the release-candidate targets.
- Current local packages are **unsigned and un-notarized**. macOS may show Gatekeeper guidance; Windows may show SmartScreen guidance. Do not present these builds as trusted-signed installers.
- macOS arm64 receives local build, payload audit, and GUI smoke. The macOS universal package receives build and payload audit only; there is **no Intel (x64) runtime host check**. Windows x64 receives cross-build and packaged-file **structural verification** only; installation and runtime acceptance on **real Windows hardware** remain external work.
- Pack contents and asset rights are the importer's responsibility. The importer checks archive structure, schema, paths, file types, and explicit responsibility acknowledgement; it cannot establish copyright, consent, likeness rights, or commercial permission.

See `RELEASE_STATUS.md` for the exact evidence and open external checks.

## Verify

```bash
npm run typecheck
npm test           # includes the responsibility-gate test suite
npm run build
npm run test:importer
npm run test:runtime:presentation
npm run audit:brand

# Candidate packages
npm run build:mac:arm64
npm run build:mac:universal
npm run build:win:x64
npm run audit:release
```

## Pack format

A CozyKin Pack is a ZIP containing `manifest.json`, `character.json`,
`behaviors.json`, `emotions.json`, and the referenced `assets/`. See `schemas/v1.1/`
for the authoritative JSON Schemas and `examples/` for the two bundled identities.

## Ethics & scope

The Prompt Generator can describe sensitive roles (e.g. a real person or a
memorial character). For those, CozyKin only helps you generate a prompt — it does
not generate, store, or distribute finished likenesses on your behalf, and drafts
stay local. You are responsible for having the rights to any photos or materials you
feed into your own agent. Bundled distribution is limited to the two original cats;
any other skin is generator-only and imported at your own responsibility.

## License

- Source code: MIT (`LICENSE`).
- Bundled original artwork and in-app copy: non-commercial (`ARTWORK_LICENSE.md`).

<br>

---

# 简体中文

<p align="center"><a href="#cozykin">English</a> · <b>简体中文</b></p>

CozyKin 是一款带 DIY 换肤生态的桌面宠物应用。它内置两只原创猫角色 —— **cookie** 与
**pudding**，并支持你用自己的 agent 生成一个自包含的角色 *Pack*，再通过带安全校验、
责任确认门的导入器把专属的情感陪伴皮肤导入进来。

> 版本 0.2.1。源码采用 MIT 许可（见 `LICENSE`）；内置的原创角色美术与文案采用单独的
> 非商业许可（见 `ARTWORK_LICENSE.md`）。

## 功能

- 两只内置角色（cookie / pudding）的桌面宠物运行时，各含标准版与正面版两种形态。
- **Prompt Generator（工作室）**：选择性格 / 特征，得到一段确定性、可自包含的提示词，
  拿去用你自己的 agent 生成角色 Pack。
- **安全校验导入器**：ZIP-slip 防护、魔数校验、schema 校验（Pack manifest **v1.1**，
  同时仍兼容 v1.0）、图片校验，以及安装预览。
- **责任确认门**：导入某个 Pack 前必须逐个勾选一条声明 ——
  *"我对生成的角色负责，且不会将其用于商业分发"* —— 默认不勾选，未接受前禁用安装，
  更换或重新导入 Pack 时重置，且从不持久化保存。

## 安装（开发）

环境要求：Node.js 20+。

```bash
npm ci
npm run build
npm start          # 启动桌面应用
```

## 桌面候选包

- 发布候选目标为 **macOS arm64**、**macOS universal** 与 **Windows x64**。
- 当前本地候选包**未签名、未公证**。macOS 可能提示 Gatekeeper，Windows 可能提示
  SmartScreen。请勿将其当作受信任的已签名安装包对外呈现。
- macOS arm64 已做本地构建、载荷审计与 GUI smoke；macOS universal 仅做构建与载荷审计，
  **未做 Intel（x64）真机运行检查**；Windows x64 仅做交叉构建与打包文件的**结构验证**，
  **Windows 真机**安装与运行验收仍属外部待办。
- Pack 内容与素材权利由导入者负责。导入器只检查压缩包结构、schema、路径、文件类型和
  显式的责任确认，无法核实版权、授权同意、肖像权或商用许可。

准确证据与尚待完成的外部检查见 `RELEASE_STATUS.md`。

## 验证

```bash
npm run typecheck
npm test           # 含责任确认门测试套件
npm run build
npm run test:importer
npm run test:runtime:presentation
npm run audit:brand

# 候选包
npm run build:mac:arm64
npm run build:mac:universal
npm run build:win:x64
npm run audit:release
```

## Pack 格式

一个 CozyKin Pack 是一个 ZIP，内含 `manifest.json`、`character.json`、
`behaviors.json`、`emotions.json` 以及被引用的 `assets/`。权威 JSON Schema 见
`schemas/v1.1/`，两只内置角色的示例见 `examples/`。

## 伦理与边界

Prompt Generator 可以描述敏感角色（例如真实人物或纪念性角色）。对这类角色，CozyKin
只帮你生成提示词 —— 不会替你生成、存储或分发成品肖像，草稿仅保留在本地。你需自行确保
拥有喂给自己 agent 的任何照片或素材的权利。随应用分发的仅限两只原创猫；其他任何皮肤都
只能通过生成器产生，并由你自行承担导入责任。

## 许可

- 源代码：MIT（`LICENSE`）。
- 内置原创美术与应用内文案：非商业许可（`ARTWORK_LICENSE.md`）。
