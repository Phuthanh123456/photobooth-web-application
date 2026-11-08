# Milestones

## Internet QR downloads (completed, 2026-11-08)

- Added right-side per-session QR on COMPLETE, with tablet/phone responsive layout and no display controls. Guest page supports framed JPG download and iPhone long-press saving.
- Persisted random grants with verified outputs; old links survive next sessions/backend restarts, explicit completed deletion revokes them, corrupt/incomplete outputs are rejected.
- Added a dedicated photo-only public listener on loopback 3006 and an official checksum-verified Cloudflare Quick Tunnel, exposing no operator/bootstrap/WebSocket/Live View routes. Documented temporary hostname/laptop-online limits and stable-origin configuration.
- Restored the existing completed display with a share grant without issuing shutters or reopening Save As. Public download matched the final JPEG hash; displayed QR decoded correctly. The operator confirmed the correct download over 4G/5G.
- 72 backend tests, six Chromium/WebKit browser tests and build passed; zero dependency audit findings. QR uniqueness, decoding, byte matching, persistence/revocation, public-route isolation and responsive layouts were tested.

## Full-opening photo correction (2026-11-08)

- Removed the safe rectangles per the operator's explicit correction. Fill each complete opening with centered cover and a two-pixel underlay bleed; sticker overlap and edge cropping are allowed, aspect ratio is preserved.
- Photos render first and the unchanged transparent PNG overlays them last in previews/JPG/PDF.
- Regenerated separate preview/final artifacts using the four existing b79303b0-a1b1-4415-bb50-c74ad77c978a originals, preserving existing saved files and issuing zero shutters. Earlier safe-area notes below are superseded.

## Sticker PNG installation (completed, 2026-11-08)

- Imported Frame CAP.png unchanged; measured eight native transparent openings and clear 3:2 photo rectangles avoiding sticker overlap. Both columns receive photos 1-4 in order without crop/stretch.
- JPG/PDF draw photos underneath the original RGBA artwork. Replaced active old PDF/second-page assets; old completed outputs preserved. Added artwork cache keys to the operator's empty preview.
- Source 2335x3289 at 399.9738dpi; output JPG 1752x2467 at 300dpi; PDF retains declared physical size. Render checks matched all eight JPG/PDF slots.
- 60 backend tests passed; the four prior browser checks and a dedicated sticker-preview cache test passed; builds passed. No new real shutters were sent. Native validation and automatic Save As remain enabled.

## 2026-11-08 requested changes

- Implemented unobstructed camera content during capture/save/composition, retaining countdown and flash.
- Implemented full-photo contain fitting in JPG/PDF; raster checks preserved both edges of a wide image.
- Implemented automatic native Windows Save As after COMPLETE, remembered folder, verified copy, overwrite/cancel/error handling, operator-only retry and privacy. The operator completed an actual save of an existing final with zero new shutters.
- Restarted REAL_NIKON services on 5176/3004 with the existing valid camera report; Z30 ready and Live View streaming.
- The initially deferred sticker replacement was completed later with the correct RGBA PNG, as recorded above.

## Fourth-photo SDK correction (completed and revalidated)

- Confine EnumDevices to initial discovery; use connected-body DeviceReady in the capture/preview path. Await explicitly busy readiness responses without retrying capture.
- Recover orphan remote preview through GetLiveViewStatus; preserve orderly native/backend shutdown and honest fault/preview state.
- Native C++ regression, 50 backend tests, three browser tests and builds passed; real no-shutter test passed 80 readiness checks and three preview restarts.
- New approved single JPEG report 2849c116-f40d-4d14-9ee0-03d6895eb0f1 passed; approved four-photo session c7a462b6-45fa-4fb7-8559-15271f31c61f reached COMPLETE with four verified 5568x3712 photos, full countdowns, JPG/PDF and large result display. SDK confirmed four shutter calls. Three prior failed-session originals preserved.
- Physical iPad and printing remain pending. Historical results below refer to earlier binaries/reports.

## M2G current status — implemented; physical iPad acceptance pending
- Actual Z30 Live View and the real four-photo workflow passed; Safari iPhone was confirmed by the operator, not a physical iPad.
- Actual WebKit preview passed before/after four captures and after SDK restart. Hardware authorization and final hashes stayed valid; restart checks issued no shutters.
- Trimmed padded SDK preview buffers without recompression (~708KB to ~20KB in the observed scene); added JPEG parser/stream tests and improved guidance contrast over bright video.
- Final validation: 47 backend tests, 2 Chromium/WebKit browser tests, complete build and clean npm audit. Actual iPad, disruptive USB/power and printing remain pending. Do not mark full physical iPad acceptance complete.
- Current real service: frontend 5176, backend loopback 3004. Default port 5173 may remain MOCK.

## M2A — Frame template and composition
- Inspected both supplied PDF pages: two color variants with eight exact vector slots each.
- Original asset, 300dpi artwork and extracted point geometry retained; both columns map rows 1–4 to photos 1–4.
- JPEG mock captures, full JPEG decode verification, progressive frame JPEG and vector-preserving PDF compositor.
- Composition tests cover mapping, progressive rows, PDF print size, high-resolution JPEG and corrupt input.

## M2B — Operator and iPad redesign
- Two-column laptop dashboard with dominant complete-template preview and verified JPEG thumbnails.
- Customer-only display with server countdown, friendly states, no operator controls or technical paths.
- Prominent mock warning; responsive layout, reduced-motion flash and safe-area handling.
- Real-time browser test passed at 1366×768 (no vertical overflow), iPad viewport and narrow mobile viewport. Test services use isolated ports 5175/3003 and storage.

## M2C — Reset, retake and final output
- Storage root is configurable; internal JPEGs are kept under temp/session-UUID, final deliverables under output.
- COMPLETE requires four verified originals plus verified 300dpi JPG, original-sized PDF and final manifest.
- Reset waits for an in-flight shutter/transfer, removes current temporary data/drafts, and blocks late callbacks. Confirmed retake deletes only current completed outputs; prior completed outputs are preserved.
- Restarted in-progress manifests become ERROR and never resume automatically.
- Operator capability cookie is issued only through a loopback-only Vite bootstrap. Originals/manifests/downloads require it; display snapshots redact internal paths and technical errors. No public temp-directory static serving.
- Validation: 29 backend tests and real-time browser workflow passed, including actual image loading/downloads and original M0/M1 invariants.

## M0 — Architecture and setup
- npm workspaces: React 19/Vite frontend, Node/TypeScript backend, shared contracts.
- Camera interface and mock adapter; feasibility and operating rules.
- Build validation and separate M0 commit.

## M1 — Four-photo engine
- Monotonic server timing, serialized camera operations, verified session storage.
- WebSocket snapshots and explicit operator commands; display has read-only connection.
- Operator/display screens; automated engine, storage and WebSocket tests.
- Validate build/tests and separate M1 commit.

## M2D — SDK inspection and native bridge (implemented)
- Actual v2.1.0 package inspected at the user-provided external path. Z30/Windows 11 support, x64 DLLs/exports, callbacks, transfer ownership, profile location and runtime imports verified.
- Original C++ bridge built successfully as Windows x64 with workspace-local Zig/Clang; external Nikon installation untouched. MSVC/CMake alternative supplied but not executed here.
- Real Node adapter, serialized bounded IPC, timeouts, safe shutdown, path validation and no-fallback camera factory implemented.
- Single-photo hardware CLI requires interactive confirmation; session gate verifies real test result, original JPEG, device and all bridge/SDK/profile hashes.
- Non-shutter probe actually loaded/initialized Nikon SDK and enumerated devices. Result: no available Z30, shutterCount 0. Camera capture/preview has not been validated.
- 43 automated tests passed: preserved M0/M1 invariants, composition/storage/reset/privacy, mocked SDK/IPC faults, real-mode gates, four-photo engine via mocked SDK and MJPEG bytes/stale/disconnection handling. Build and npm audit passed.

## M2E — Physical single-photo validation (PASSED)
- Test command, confirmation gate, original-image verification and timing/report storage implemented.
- Current hardware result: confirmed Z30 JPEG captured/transferred, decoded at 5568x3712, 7,224,414 bytes; SHA-256 verified and SDK released safely. Report 040344af-4f6e-4424-9db4-297a0864d194 passed.
- First authorized card-only shot failed host delivery; no automatic retry. A separately approved second shot passed after fixing SDK DLL lifetime, DeviceReady handling, SaveMedia=2 and explicit save paths.
- SDK ImageSaved 743ms / CaptureComplete 755ms; split transfer latency unavailable due callback order, recorded null. USB identity hash supplements the generic device version.

## M2F — Real four-photo integration (PASSED)
- Real adapter is wired to the existing session engine and tested through a mock SDK boundary, including full deadlines and final output verification.
- Following separate explicit four-photo authorization, one START produced exactly four verified 5568x3712 originals and COMPLETE session 81c215e9-9632-4d26-b426-81a27e73e7cf. Every shutter was after the full countdown deadline (7.49-12.93ms late).
- Actual JPG/PDF/manifest downloads and PDF rendering verified. Live reset-authorization/original-image protection checked; current completed outputs retained. Destructive real retake not executed; busy-reset safety is covered by mock SDK tests.

## M2G — Live View and final validation (implemented; physical iPad pending)
- Independent SDK callback lifecycle, bounded latest-frame IPC, ~8fps MJPEG streaming, aspect-preserving iPad preview and stale/disconnect handling implemented/tested with injected frames.
- Chromium full workflow and WebKit iPad-viewport countdown/reconnection/active reset passed (2 browser tests). Actual Nikon Live View and the four-photo capture/export workflow also passed, with operator-confirmed Safari iPhone video. Physical iPad, disruptive USB/power and actual printing remain untested; full iPad acceptance is pending.

## Implementation evidence
- M0: workspace scripts, typed contracts, adapter boundary, mock and all four documents; build passed. Commit `dea8274`.
- M1: serialized monotonic engine, read-back/hash verification, atomic manifests, error/cancel acknowledgement, authoritative WebSocket snapshots, read-only display, operator UI.
- Validation: `npm test`, `npm run build`, `npm run test:e2e`. The browser test uses real 10-second countdowns; engine tests also verify exact virtual boundaries.
- Historical M1 results: 17 backend tests and 1 Chromium integration test passed. M2 source extends those tests without discarding the original behavioral coverage; see current milestone evidence above.

M2E follow-up: 43 automated tests and the complete TypeScript/Vite build passed. Real Live View was observed in WebKit at 640x424 before the separately authorized M2F session.
