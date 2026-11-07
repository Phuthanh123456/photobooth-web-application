# Implementation report — 2026-11-07

| Milestone | Status | Evidence |
|---|---|---|
| M0 / M1 | Preserved | `dea8274` / `34d0248`; original behavioral tests retained |
| M2A | IMPLEMENTED / TESTED WITH MOCK | `cbb3536`: actual two-page template, geometry, valid JPEG mock, progressive composition |
| M2B | IMPLEMENTED / TESTED WITH MOCK | `6f084ff`: laptop dashboard, display-only iPad layout, real-time browser tests |
| M2C | IMPLEMENTED / TESTED WITH MOCK | `39cc9a2`: final JPG/PDF/manifest verification, cleanup/reset/retake, authorization |
| M2D | IMPLEMENTED / BUILD VERIFIED / TESTED WITH MOCK SDK | This source commit: Windows x64 C++ bridge, real adapter, strict mode/gates, boundary tests; actual SDK initialization/enumeration ran |
| M2E | TESTED WITH REAL NIKON Z30 / PASSED | Confirmed original JPEG 5568?3712, 7,224,414 bytes, hash verified and resources released; report 040344af-4f6e-4424-9db4-297a0864d194 |
| M2F | TESTED WITH REAL NIKON Z30 / PASSED | Exactly one START ? four full deadlines ? four verified 5568?3712 images ? verified final JPG/PDF/manifest; session 81c215e9-9632-4d26-b426-81a27e73e7cf |
| M2G | Acceptance BLOCKED | SDK preview lifecycle/MJPEG implemented and injected-frame tests passed; actual Z30/iPad/print acceptance not run |

## Verified results

- `npm test`: 43 tests passed across 8 files, including original M1 invariants, full countdowns/four-photo sequence, failure/overlap/reconnection, composition geometry/duplicate slots, final PDF/JPG, JPEG decoding, reset during capture, cleanup/final preservation, privacy/authorization, mocked SDK/bridge crashes/timeouts and Live View stream lifecycle.
- `npm run build`: shared/backend/frontend TypeScript checks and Vite build passed.
- `npm run test:e2e`: two browser tests passed: the real-time Chromium workflow plus WebKit iPad display/countdown/reconnection/active reset; four photos, progressive actual-template preview, original image loading, final download/manifest, display reload, cancel/reset, 1366×768 laptop fit, iPad touch viewport and narrow layout.
- `npm audit`: zero known vulnerabilities at verification time.
- `npm run camera:build`: successful Windows x64 native build with local Zig/Clang 0.17.1; vendor SDK untouched/untracked. MSVC/CMake alternative not executed here.
- `python tools/inspect-sdk.py`: actual x64 DLL architecture/imports and required exports verified.
- `npm run camera:probe`: actual SDK load/initialization/enumeration reached device detection and failed honestly with no available Nikon Z30; shutterCount **0**. Report: `storage/hardware-test/04865b96-6531-438e-8ff7-f424e775dc6a/result.json` (private, ignored).

Current M2E evidence confirms one real JPEG capture/transfer and actual Live View in WebKit. Historical M2D no-camera probe results below are retained as history, not current capability status. No Nikon proprietary files, captured photos, final exports, secrets or native binaries are committed. No push was performed.

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

M2E has passed on the actual Z30. Real four-photo capture/export has passed. USB interruption, physical iPad identity/full Safari acceptance and actual printing remain unverified. Actual Live View has rendered in WebKit at 640?424. Single-photo ImageSaved took 743ms; CaptureComplete callback took 755ms, so split transfer duration cannot be reliably derived and remains null. The SDK-supported enum strings are checked at runtime; an unfamiliar representation fails closed instead of guessing. Device/SDK/bridge/profile changes invalidate the validation report.

Only a local trusted-LAN dev deployment is configured. Automatic face-aware cropping, retention scheduling and public hosting/authentication are not implemented. Centre cover-cropping may require pose/framing adjustment on the real scene. Completed output is protected, while old cancelled/error sessions and orphan native transfers from prior processes can remain for manual inspection. An explicit current-session reset waits for native process exit before discarding registered failed transfers. SDK redistribution/license permission must be reviewed before packaging vendor components.

## M2E physical evidence update

First authorized exposure: shutter observed by operator and CaptureComplete in SDK log, but SaveMedia=0 (card-only) meant no host JPEG; report d4c896a5-e5b8-4718-b3fe-851598fd2db4 FAILED. No automatic retry occurred. After reading back SaveMedia=2 and a separate explicit one-photo authorization, report 040344af-4f6e-4424-9db4-297a0864d194 PASSED. Original SHA-256: `6c1f52b3a5f54bb1cfa449652d2e0b892e628de04bbfb24b96549eb8ab8647b0`. The SDK-reported size label differs from actual decoded dimensions; the JPEG itself is authoritative. Native/Node source, SDK/profile hashes and Windows USB device hash bind subsequent authorization.

## M2F physical evidence update

Operator separately approved exactly one four-photo real session. `storage/hardware-test/m2f-confirmed-four-photo-2.json` records one START, authoritative deadlines, four distinct original hashes, browser completion and output verification. Shutters were 12.93 / 7.49 / 10.67 / 11.54ms after their respective deadlines. All originals decoded at 5568?3712. Final JPG is 739,156 bytes at 300dpi; PDF is 31,418,808 bytes and renders at the original page size with duplicate placement of four photos.

Outputs: `storage/output/photobooth-81c215e9-9632-4d26-b426-81a27e73e7cf-final.jpg`, `-final.pdf`, `-manifest.json`. Their hashes remained unchanged after rejected operator RESET-without-confirmation and display RESET attempts. Public original access returned 403. Busy/reset transfer races remain mock-SDK-tested; no completed real output was deleted for testing. No additional START/shutter was issued.
