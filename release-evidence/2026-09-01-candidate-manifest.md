# CozyKin 0.2.1 candidate manifest — 2026-09-01

Generated from commit branch `codex/final-optimization-20260831` on Apple Silicon macOS with Node.js 26, Electron 43.1.1, and electron-builder 26.15.3.

| Artifact | Bytes | SHA256 | Verification scope |
|---|---:|---|---|
| `CozyKin-0.2.1-arm64.dmg` | 165,663,889 | `341421b7ced708511db2539b24b93d7833d05caca5c43656b9dc2554265419d9` | macOS arm64 package, payload audit, isolated-profile GUI smoke |
| `CozyKin-0.2.1-universal.dmg` | 262,289,000 | `040129e2188d5cf816218b3e778186137fd5bed058c4b79bc912166160a65215` | macOS x64+arm64 package and payload audit; no Intel runtime host check |
| `CozyKin Setup 0.2.1.exe` | 132,035,405 | `d0ecbcd7c1df5df3d5cc731e59fc50171ac5ef758baf740f7767dcd20c7025bd` | NSIS installer structure; unpacked application is PE32+ x86-64; no Windows host check |

## Signing state

- macOS application: ad-hoc/linker signature only, no TeamIdentifier, no Developer ID, not notarized.
- Windows installer: no project certificate was configured; treat as unsigned regardless of electron-builder's internal `signtool.exe` resource-update log.

## Payload gates

- `npm run audit:release`: passed across all packaged payload directories.
- Release safety scan with `--include-artifacts`: blocking 0, warning 0, info 17. All 17 informational findings are reviewed Chromium license attributions in `win-unpacked/LICENSES.chromium.html`; the narrow review rule is maintained as `coop_tasks/cozykin_release_allowlist.txt` in the release workspace.
- Candidate payload contains four bundled CozyKin cat profiles only. It contains no private QA Pack, unrelated provenance material, source photographs, or legacy brand assets.
