# Implementation report — 2026-11-07

| Milestone | Status | Evidence |
|---|---|---|
| M0 / M1 | Preserved | `dea8274` / `34d0248`; original behavioral tests retained |
| M2A | IMPLEMENTED / TESTED WITH MOCK | `cbb3536`: actual two-page template, geometry, valid JPEG mock, progressive composition |
| M2B | IMPLEMENTED / TESTED WITH MOCK | `6f084ff`: laptop dashboard, display-only iPad layout, real-time browser tests |
| M2C | IMPLEMENTED / TESTED WITH MOCK | `39cc9a2`: final JPG/PDF/manifest verification, cleanup/reset/retake, authorization |
| M2D | IMPLEMENTED / BUILD VERIFIED / TESTED WITH MOCK SDK | This source commit: Windows x64 C++ bridge, real adapter, strict mode/gates, boundary tests; actual SDK initialization/enumeration ran |
| M2E | BLOCKED / NOT TESTED WITH REAL NIKON Z30 | Probe found no available camera; no shutter was issued. Interactive single-photo test is ready |
| M2F | Acceptance BLOCKED | Engine wired/tested via mocked SDK; real sessions remain gated by successful hardware validation |
| M2G | Acceptance BLOCKED | SDK preview lifecycle/MJPEG implemented and injected-frame tests passed; actual Z30/iPad/print acceptance not run |

## Verified results

- `npm test`: 42 tests passed across 8 files, including original M1 invariants, full countdowns/four-photo sequence, failure/overlap/reconnection, composition geometry/duplicate slots, final PDF/JPG, JPEG decoding, reset during capture, cleanup/final preservation, privacy/authorization, mocked SDK/bridge crashes/timeouts and Live View stream lifecycle.
- `npm run build`: shared/backend/frontend TypeScript checks and Vite build passed.
- `npm run test:e2e`: two browser tests passed: the real-time Chromium workflow plus WebKit iPad display/countdown/reconnection/active reset; four photos, progressive actual-template preview, original image loading, final download/manifest, display reload, cancel/reset, 1366×768 laptop fit, iPad touch viewport and narrow layout.
- `npm audit`: zero known vulnerabilities at verification time.
- `npm run camera:build`: successful Windows x64 native build with local Zig/Clang 0.17.1; vendor SDK untouched/untracked. MSVC/CMake alternative not executed here.
- `python tools/inspect-sdk.py`: actual x64 DLL architecture/imports and required exports verified.
- `npm run camera:probe`: actual SDK load/initialization/enumeration reached device detection and failed honestly with no available Nikon Z30; shutterCount **0**. Report: `storage/hardware-test/04865b96-6531-438e-8ff7-f424e775dc6a/result.json` (private, ignored).

No result in this report claims a real capture or real Live View passed. No Nikon proprietary files, captured photos, final exports, secrets or native binaries are committed. No push was performed.

## Changed files

- `assets/templates/`: supplied PDF, both rendered designs, exact slot geometry and template documentation.
- `backend/src/composition.ts`, `storage.ts`, `engine.ts`: JPEG verification, deterministic cover-cropping, progressive frames, final print exports and safe lifecycle.
- `backend/src/server.ts`, `index.ts`, `camera-factory.ts`, `camera.ts`: protected operator/media routes, redacted state, configurable storage/modes and gated real adapter wiring.
- `backend/src/nikon/`: bounded native IPC, real Nikon adapter, profile/fingerprint checks and confirmed hardware-test CLI.
- `native/`, `tools/`: original C++ bridge/CMake, build/SDK-inspection/compatibility and frame-extraction scripts.
- `frontend/src/`, Vite/Playwright configuration: operator redesign, customer display, real-preview transport, capability bootstrap, server-authoritative state and isolated browser tests.
- `shared/src/index.ts`, backend/browser tests, workspace scripts and all four requested project documents; Git ignores/binary attributes updated.

## Output and use

Start mock: `$env:CAMERA_MODE='MOCK'; npm run dev`. Operator: `http://localhost:5173/operator`. iPad: `http://<laptop-IP>:5173/display` on the same trusted Wi-Fi. Click Start once, wait for four automatic countdown/capture cycles, inspect/download the final frame, then cancel/reset or start another session. Windows Firewall and full steps are in README.

Default final deliverables: `storage/output/photobooth-<UUID>-final.jpg`, `-final.pdf`, `-manifest.json`. Original JPEGs are internal under `storage/temp/session-<UUID>/`. Browser-generated mock artifacts are isolated under `.local/e2e-storage/output/`. Set `STORAGE_ROOT` to override the root.

For hardware, close competing clients and any real-mode backend, connect/power the Z30, set `NIKON_SDK_ROOT` to the inspected external installation, run `npm run camera:probe`, then run **`npm run camera:test` in an interactive terminal**. It requests exact confirmation before one shutter. A PASSED report plus its verified original is required in `NIKON_VALIDATION_FILE` before REAL_NIKON four-photo sessions unlock. See README for exact build/setup/start commands.

## Limitations / remaining blockers

Physical Nikon connection and operator shutter confirmation are still required for M2E. Actual JPEG Large/Fine capability behavior, capture/transfer latency, four real photos, real Live View, USB interruption, physical iPad Safari and print acceptance remain unverified. The SDK-supported enum strings are checked at runtime; an unfamiliar representation fails closed instead of guessing. Device/SDK/bridge/profile changes invalidate the validation report.

Only a local trusted-LAN dev deployment is configured. Automatic face-aware cropping, retention scheduling and public hosting/authentication are not implemented. Centre cover-cropping may require pose/framing adjustment on the real scene. Completed output is protected, while old cancelled/error sessions and orphan native transfers from prior processes can remain for manual inspection. An explicit current-session reset waits for native process exit before discarding registered failed transfers. SDK redistribution/license permission must be reviewed before packaging vendor components.
