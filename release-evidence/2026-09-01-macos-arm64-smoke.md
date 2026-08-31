# CozyKin macOS arm64 smoke — 2026-09-01

Target: packaged `release/mac-arm64/CozyKin.app`, run on Apple Silicon macOS.

| Check | Result | Evidence |
|---|---|---|
| Process startup | PASS | Packaged executable remained live; no initialization error dialog or fatal stderr output. |
| Companion window | PASS | Transparent companion window rendered Cookie and transitioned to a bundled sleep frame. |
| Tray construction | PASS (construction) | Application reached and remained past synchronous `createTray()` initialization. Menu-item pointer interaction was not independently automated. |
| Character Studio | PASS | Packaged Studio page was opened through the app's own preload/IPC action and rendered onboarding, import action, library, and creator navigation. |
| Clean-profile bundled library | PASS | Fresh isolated user data showed exactly Cookie, Pudding, Cookie Front, and Pudding Front; no private QA roles appeared. |
| Existing-profile migration behavior | OBSERVED | A normal profile retained historical user-installed Packs. Those files were user data outside the application payload, not bundled release content. No automatic deletion is performed. |
| Four built-in Pack validation | PASS | Real Electron importer smoke reported 0 issues for all four generated ZIPs. |
| Pack preview and responsibility gate | PASS (automated integration) | Main-process importer smoke, 18 responsibility-token/install/replacement tests, and rendered-copy tests passed. OS file-picker pointer traversal was not independently automated in this run. |
| Runtime presentation | PASS | All four built-ins passed; Pudding Front wake weighting/fallback, pixel-hit wiring, settings flush wiring, and random restoration passed. |
| Signed/notarized launch | NOT APPLICABLE | Candidate is ad-hoc signed only and not notarized. |

The smoke used `/private/tmp/cozykin-smoke-20260901` as isolated user data so prior local Packs could not contaminate release-content assertions.
