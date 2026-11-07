# Implementation report — 2026-11-07

## Fourth-photo native SDK correction (current verified binary)

Failed session `96a50b69-7d06-4981-aff6-ba717293638c` kept three verified originals. Its log showed DeviceReady success followed by EnumDevices failure (-108) during live preview before the fourth shutter. Removed USB rediscovery from ready(): connected-body DeviceReady still rejects busy/disconnected states. Added bounded waits for explicit busy responses, latched readiness/capture failures, and rejection of late preview frames after faults. Added GetLiveViewStatus-based recovery of orphan remote preview and orderly native console/backend shutdown.

Regression uses the actual production C++ Camera with injected SDK functions: repeated readiness cannot call a failing discovery API; busy/disconnected/status failures issue zero shutters; orphan preview is stopped before restarting. Run `npm run camera:test:native`. SDK export/header/manual signatures were verified locally. No vendor files were committed.

Validation: native regression passed, 50 backend tests passed, 3 Chromium/WebKit E2E tests passed, full build passed. Real no-shutter report `storage/hardware-test/readiness-fix-1794069585087.json` passed 80 READY checks, three preview restart cycles, 80 distinct JPEG previews in 51.9 seconds, clean close, and preservation of all three earlier originals.

The operator then explicitly approved five new photos: one single-photo validation plus one four-photo session. Current single-photo report `storage/hardware-test/2849c116-f40d-4d14-9ee0-03d6895eb0f1/result.json` PASSED, original 5568x3712, 7,862,935 bytes, ImageSaved 953ms. Four-photo report `storage/hardware-test/readiness-fix-confirmed-four-photo.json` PASSED with one START and session `c7a462b6-45fa-4fb7-8559-15271f31c61f`. All four decoded 5568x3712 JPEGs verified; deadline lateness 16.7/34.7/38.1/10.6ms, none early. Final JPG and one-page PDF verified; large completed-frame display reached WebKit, with camera view removed. SDK log for bridge PID 42376 counted four StartShooting calls and one initial device discovery. Eight fresh previews were received after completion. No extra shutters/retries were sent. Completed output remains in storage/output and the service remains COMPLETE.

The following sections describe earlier evidence; older report fingerprints do not authorize this modified binary. Physical iPad and printing acceptance remain pending.

## Live View recovery follow-up

The display now reads fresh JPEG snapshots with server frame IDs, bounded sequential requests and automatic reconnection. It removes stale images instead of leaving the final MJPEG frame frozen on screen. Tests cover HTTP failure/recovery and a stream that stops advancing its frame ID. Preview transport cannot send capture commands. The old MJPEG endpoint remains for compatibility.

During this fix the SDK reported `StartLiveView failed (-109)`; the local Nikon log explicitly recorded `Already in live view state`. After the operator power-cycled the Z30 and the backend reconnected, 15 HTTP snapshot requests returned 15 distinct frame IDs and 15 distinct JPEG hashes. Camera readiness was true. This check sent zero shutters. Native bridge/SDK/validated capture code was unchanged.

Validation: 48 backend tests passed; the three Chromium/WebKit E2E tests passed. After adding repeated-frame staleness coverage, both WebKit tests passed again. Builds passed. A separate WebKit visit to the real `/display` rendered 640x424 camera images with eight successive image sources and zero controls or shutter commands. The Vite proxy includes the new snapshot endpoint.

## Final M2G evidence update

**IMPLEMENTED / TESTED WITH REAL Z30:** single-photo capture, exactly one separately approved four-photo session, verified JPG/PDF/manifest, real Live View before/after capture, SDK/backend restart/reconnection and completed-output preservation. **TESTED WITH SAFARI IPHONE:** operator-confirmed real feed. **NOT TESTED:** physical iPad (not available), disruptive USB/power, actual printing and destructive retake of the completed real output.

Final software checks: **47 backend tests across 9 files; 2 Chromium/WebKit browser tests; full build passed; zero npm audit vulnerabilities**. The previously recorded lower test counts below are historical milestone results.

SDK preview buffers contained padding/stale bytes beyond the main JPEG. Marker-aware trimming reduced the observed payload from 708,096 bytes to about 20KB without recompression. Actual post-change stream: 21 frames / 3.217s, 412,245 bytes total, sample JPEG 19,595 bytes at 640×424. Bright-scene guidance received a dark contrast overlay. The restart/hardware-gate/output-hash check issued no shutters. Evidence: `storage/hardware-test/m2g-live-view-optimized.json`.

Current real-mode URLs: laptop **http://localhost:5176/operator**; iPhone/iPad **http://192.168.1.6:5176/display**. Backend is loopback 3004. Port 5173 may still be MOCK. Exact environment/start commands are at the top of README. An actual iPad should be tested with the same display URL before the event; iPhone confirmation is not reported as iPad acceptance.

| Milestone | Status | Evidence |
|---|---|---|
| M0 / M1 | Preserved | `dea8274` / `34d0248`; original behavioral tests retained |
| M2A | IMPLEMENTED / TESTED WITH MOCK | `cbb3536`: actual two-page template, geometry, valid JPEG mock, progressive composition |
| M2B | IMPLEMENTED / TESTED WITH MOCK | `6f084ff`: laptop dashboard, display-only iPad layout, real-time browser tests |
| M2C | IMPLEMENTED / TESTED WITH MOCK | `39cc9a2`: final JPG/PDF/manifest verification, cleanup/reset/retake, authorization |
| M2D | IMPLEMENTED / BUILD VERIFIED / TESTED WITH MOCK SDK | This source commit: Windows x64 C++ bridge, real adapter, strict mode/gates, boundary tests; actual SDK initialization/enumeration ran |
| M2E | TESTED WITH REAL NIKON Z30 / PASSED | Confirmed original JPEG 5568x3712, 7,224,414 bytes, hash verified and resources released; report 040344af-4f6e-4424-9db4-297a0864d194 |
| M2F | TESTED WITH REAL NIKON Z30 / PASSED | Exactly one START -> four full deadlines -> four verified 5568x3712 images -> verified final JPG/PDF/manifest; session 81c215e9-9632-4d26-b426-81a27e73e7cf |
| M2G | IMPLEMENTED; IPAD ACCEPTANCE PENDING | Actual Z30 Live View and Safari iPhone confirmed; WebKit tablet viewport validated. Actual iPad unavailable; print/disruption checks not run |

## Verified results

- `npm test`: 47 tests passed across 9 files, including original M1 invariants, full countdowns/four-photo sequence, failure/overlap/reconnection, composition geometry/duplicate slots, final PDF/JPG, JPEG decoding, reset during capture, cleanup/final preservation, privacy/authorization, mocked SDK/bridge crashes/timeouts, JPEG preview trimming and Live View stream lifecycle.
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

M2E has passed on the actual Z30. Real four-photo capture/export has passed. USB interruption, physical iPad identity/full Safari acceptance and actual printing remain unverified. Actual Live View has rendered in WebKit at 640x424. Single-photo ImageSaved took 743ms; CaptureComplete callback took 755ms, so split transfer duration cannot be reliably derived and remains null. The SDK-supported enum strings are checked at runtime; an unfamiliar representation fails closed instead of guessing. Device/SDK/bridge/profile changes invalidate the validation report.

Only a local trusted-LAN dev deployment is configured. Automatic face-aware cropping, retention scheduling and public hosting/authentication are not implemented. Centre cover-cropping may require pose/framing adjustment on the real scene. Completed output is protected, while old cancelled/error sessions and orphan native transfers from prior processes can remain for manual inspection. An explicit current-session reset waits for native process exit before discarding registered failed transfers. SDK redistribution/license permission must be reviewed before packaging vendor components.

## M2E physical evidence update

First authorized exposure: shutter observed by operator and CaptureComplete in SDK log, but SaveMedia=0 (card-only) meant no host JPEG; report d4c896a5-e5b8-4718-b3fe-851598fd2db4 FAILED. No automatic retry occurred. After reading back SaveMedia=2 and a separate explicit one-photo authorization, report 040344af-4f6e-4424-9db4-297a0864d194 PASSED. Original SHA-256: `6c1f52b3a5f54bb1cfa449652d2e0b892e628de04bbfb24b96549eb8ab8647b0`. The SDK-reported size label differs from actual decoded dimensions; the JPEG itself is authoritative. Native/Node source, SDK/profile hashes and Windows USB device hash bind subsequent authorization.

## M2F physical evidence update

Operator separately approved exactly one four-photo real session. `storage/hardware-test/m2f-confirmed-four-photo-2.json` records one START, authoritative deadlines, four distinct original hashes, browser completion and output verification. Shutters were 12.93 / 7.49 / 10.67 / 11.54ms after their respective deadlines. All originals decoded at 5568x3712. Final JPG is 739,156 bytes at 300dpi; PDF is 31,418,808 bytes and renders at the original page size with duplicate placement of four photos.

Outputs: `storage/output/photobooth-81c215e9-9632-4d26-b426-81a27e73e7cf-final.jpg`, `-final.pdf`, `-manifest.json`. Their hashes remained unchanged after rejected operator RESET-without-confirmation and display RESET attempts. Public original access returned 403. Busy/reset transfer races remain mock-SDK-tested; no completed real output was deleted for testing. No additional START/shutter was issued.
