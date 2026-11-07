# Milestones

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
- 42 automated tests passed: preserved M0/M1 invariants, composition/storage/reset/privacy, mocked SDK/IPC faults, real-mode gates, four-photo engine via mocked SDK and MJPEG bytes/stale/disconnection handling. Build and npm audit passed.

## M2E — Physical single-photo validation (BLOCKED)
- Test command, confirmation gate, original-image verification and timing/report storage implemented.
- Physical camera absent during probe; operator connection and exact one-shutter confirmation are required. No real JPEG exists from this run. Never mark PASSED based on mock evidence.

## M2F — Real four-photo integration (acceptance BLOCKED)
- Real adapter is wired to the existing session engine and tested through a mock SDK boundary, including full deadlines and final output verification.
- REAL_NIKON four-photo sessions remain locked without passed single-photo validation. Four physical captures/reset acceptance have not run. This milestone is not marked complete.

## M2G — Live View and final validation (acceptance BLOCKED)
- Independent SDK callback lifecycle, bounded latest-frame IPC, ~8fps MJPEG streaming, aspect-preserving iPad preview and stale/disconnect handling implemented/tested with injected frames.
- Chromium full workflow and WebKit iPad-viewport countdown/reconnection/active reset passed (2 browser tests). Actual Nikon Live View, physical iPad Safari, USB disruption and real end-to-end acceptance remain untested. This milestone is not marked complete.

## Implementation evidence
- M0: workspace scripts, typed contracts, adapter boundary, mock and all four documents; build passed. Commit `dea8274`.
- M1: serialized monotonic engine, read-back/hash verification, atomic manifests, error/cancel acknowledgement, authoritative WebSocket snapshots, read-only display, operator UI.
- Validation: `npm test`, `npm run build`, `npm run test:e2e`. The browser test uses real 10-second countdowns; engine tests also verify exact virtual boundaries.
- Historical M1 results: 17 backend tests and 1 Chromium integration test passed. M2 source extends those tests without discarding the original behavioral coverage; see current milestone evidence above.
