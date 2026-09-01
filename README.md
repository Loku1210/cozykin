# CozyKin

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
- Current local packages are **未签名、未公证**. macOS may show Gatekeeper guidance; Windows may show SmartScreen guidance. Do not present these builds as trusted-signed installers.
- macOS arm64 receives local build, payload audit, and GUI smoke. The macOS universal package receives build and payload audit only; there is **no Intel (x64) runtime host check**. Windows x64 receives cross-build and packaged-file **结构验证** only; **Windows 真机** installation and runtime acceptance remain external work.
- Pack 内容与素材权利由导入者负责。The importer checks archive structure, schema, paths, file types, and explicit responsibility acknowledgement; it cannot establish copyright, consent, likeness rights, or commercial permission.

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
