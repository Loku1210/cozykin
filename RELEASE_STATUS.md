# CozyKin 0.2.1 release status

This file separates reproducible local evidence from checks that require signing credentials or other hardware.

| Target | Build | Payload checks | Runtime acceptance | Distribution status |
|---|---|---|---|---|
| macOS arm64 | Candidate build in this release batch | `audit:brand`, `audit:release`, safety scan, manifest, SHA256 | Local GUI smoke recorded separately | 未签名、未公证 |
| Windows x64 | Cross-built candidate in this release batch | Installer and unpacked payload 结构验证, safety scan, manifest, SHA256 | Windows 真机未验收 | 未签名 |
| macOS universal | Candidate produced in this release batch | Payload audit and SHA256 | No Intel runtime host check | 未签名、未公证 |

## Required local verification

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:importer
npm run test:runtime:presentation
npm run audit:brand
npm run build:mac:arm64
npm run build:mac:universal
npm run build:win:x64
npm run audit:release
```

The release safety scan must run on a staging tree without `.git`, `node_modules`, caches, private QA directories, or unrelated Pack archives. Generated installers receive SHA256 checksums and an artifact manifest.

## External acceptance still required

- Apple Developer ID signing and notarization.
- Windows code signing and Windows 真机 installation/runtime checks.
- Independent review of any user-created Pack's source rights, consent, and intended distribution.

CozyKin never treats structural Pack validation as proof of ownership or permission.

Exact candidate hashes and smoke results are recorded under `release-evidence/`.
