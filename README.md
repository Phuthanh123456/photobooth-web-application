# CAP · Nikon Z30 photobooth

Current real-camera validation setup: laptop **http://localhost:5176/operator**, display **http://192.168.1.6:5176/display**, loopback backend 3004. Port 5173 may still be a separate MOCK app. The operator confirmed real Live View in **Safari iPhone**; no physical iPad is available yet. Single-photo and four-photo Z30 capture/export have passed. Physical iPad, disruptive USB/power tests and actual printing remain pending.

## Capture display and automatic Save As (2026-11-08)

After each countdown, the display flashes and keeps the camera unobstructed during CAPTURING, SAVING and COMPOSING. It shows no Smile/saving card in those states. The completed frame still fills the main display after photo 4.

The JPEG and PDF compositors fit the entire photo inside each slot without cropping or stretching. Different aspect ratios can leave white bars. The supplied `Frame CAP (1).pdf` was byte-identical to the old template; the operator confirmed it was the wrong file and deferred the sticker replacement until the correct PDF is provided. The current frame is retained temporarily.

Set `AUTO_SAVE_DIALOG=1` on the Windows backend to open a native Save As window automatically after COMPLETE. Choose a folder and press Save; the chosen folder is remembered for subsequent sessions. Optional `PHOTOBOOTH_SAVE_FOLDER` sets the initial folder before the first successful save. Cancel keeps the verified originals/final output and does not automatically reopen the window. The operator can use **Save image as…** to try again. A confirmed overwrite is required for existing files. Save As runs on the laptop; display clients cannot open it or receive saved paths. Finish/cancel an open dialog before deleting the current completed session with Retake. Browser download links remain optional fallback actions.

The real Windows dialog was operator-confirmed and saved a byte-verified copy of an existing final JPEG. No new shutters were issued for this change. See IMPLEMENTATION_REPORT.md for test evidence.

## Fourth-photo SDK fix (verified native binary)

The failing session saved three photos, then `EnumDevices` failed with -108 immediately after a successful DeviceReady. The bridge now discovers devices only when connecting; every connected-body readiness check uses DeviceReady, with no USB rescan during capture or preview. Explicit body-busy responses are awaited without retrying shutters. Remote preview left by an earlier process is stopped/restarted using documented GetLiveViewStatus. Terminal shutdown lets the backend close the SDK cleanly.

Current binary validation passed: one separately approved JPEG (`2849c116-f40d-4d14-9ee0-03d6895eb0f1`), then exactly one approved four-photo session (`c7a462b6-45fa-4fb7-8559-15271f31c61f`). All four 5568x3712 images were verified, full 10-second countdowns respected, final JPG/PDF produced, and the display showed the large completed frame. SDK log counted exactly four StartShooting calls. Live View remained fresh after photo 4. The earlier failed session's three saved photos were preserved.

Checks: 50 backend tests, 3 browser tests, native C++ regression, builds, and a real no-shutter test with 80 readiness checks plus three preview restarts passed. Run native regression with `npm run camera:test:native` after setting NIKON_SDK_ROOT. Older hardware reports below are historical and cannot unlock the changed binary.

## Earlier M2G validation evidence

Actual Z30 Live View remained functional before/after four real captures and after SDK/backend restart. A post-optimization 3.217s check received 21 fresh 640×424 frames (about 6.5fps), 412,245 bytes total. The SDK buffer was 708,096 bytes/frame with trailing padding/stale data; the main JPEG was about 20KB. The server now parses JPEG markers to send only that JPEG without recompression, including correct handling of progressive scans and embedded thumbnail markers. Guidance has a dark contrast overlay over bright video.

Restart/reconnection issued no shutters, kept the passed hardware report valid, and preserved every completed output hash. Evidence is private under `storage/hardware-test/m2g-live-view-optimized.json`. Final software checks: **47 backend tests, 2 Chromium/WebKit browser tests, full build passed; zero npm audit vulnerabilities**. Physical iPad acceptance remains pending; iPhone results are not described as iPad tests.

For a fresh start after stopping the running services, these commands reproduce the real-mode setup:

```powershell
$env:NIKON_SDK_ROOT='D:\PhuThanh\Code\NikonSDK\RemoteModuleSDK\S-SDKZ-210BF-ALLIN'
$env:CAMERA_MODE='REAL_NIKON'
$env:NIKON_VALIDATION_FILE='D:\PhuThanh\Code\photobooth\storage\hardware-test\2849c116-f40d-4d14-9ee0-03d6895eb0f1\result.json'
$env:BACKEND_PORT='3004'
$env:FRONTEND_PORT='5176'
$env:AUTO_SAVE_DIALOG='1'
npm run dev
```

Continue the existing React 19/Vite, Node/TypeScript and shared-contract workspaces. Operator controls the laptop; the iPad is a read-only display. Four photos, each with a full server-controlled 10-second countdown, are duplicated into the supplied double-strip frame.

**Implemented and tested with mock:** verified JPEG captures, progressive actual-template preview, high-resolution final JPG/PDF, cancellation, reset/retake, protected storage, reconnection and native SDK boundary tests. **TESTED WITH REAL NIKON Z30:** one confirmed JPEG capture passed (5568x3712, 7,224,414 bytes, verified SHA-256), and actual 640x424 Live View reached WebKit. A separately authorized four-photo Z30 session also reached COMPLETE with verified JPG/PDF. Physical tablet/phone browser identity, printing and disruption checks are tracked separately. REAL_NIKON sessions unlock only with a matching passed hardware report. See [feasibility](CAMERA_FEASIBILITY.md) and [milestones](TASK_DECOMPOSITION.md).

## Start in MOCK mode

Requires Node.js 22.12+ (Node 24 recommended) and npm. From this repository root:

```powershell
npm install
$env:CAMERA_MODE='MOCK'
npm run dev
```

- Operator on laptop: **http://localhost:5173/operator**
- iPad: **http://<laptop-Wi-Fi-IPv4>:5173/display**
- Separate terminals: `npm run dev:backend` and `npm run dev:frontend`.
- Health: `http://localhost:3001/health`.

MOCK produces labeled, valid 1800×1200 JPEG test images. Its preview is clearly labeled as mock. It never uses the physical camera. The mode is configured at backend startup; switching modes requires a restart. Invalid mode names fail instead of silently selecting mock.

## Full mock workflow

1. Open `/operator` using localhost on the laptop. Open `/display` on the iPad. Wait for Connected.
2. Click Start Session once. Both screens show the same backend seconds. Four full 10-second countdowns run automatically.
3. After each verified JPEG, its row fills in both frame columns. The next countdown starts only after saving, frame update and camera readiness. Never click a Nikon shutter manually.
4. After photo 4, the server verifies originals, generates final JPG/PDF and verifies both files and the manifest before COMPLETE. The full frame appears on the display; when AUTO_SAVE_DIALOG=1, a native Save As window opens on the laptop. Choose a folder and press Save. JPG/PDF remain in the output folder even if you cancel.
5. Cancel prevents future shutters; an already exposed image finishes transfer/save. Reset / Retake waits for that work, then removes current temporary captures/drafts. No late callback can repopulate the cleared preview.
6. Starting a new session preserves earlier final outputs and removes the previous session's temporary originals. Retaking the current COMPLETE session requires explicit deletion confirmation; it deletes that current final output only.

ERROR never retries or resumes an uncertain shutter. Inspect camera and storage before resetting. A native timeout/crash latches the adapter; reset does not reconnect an uncertain camera. Restart and reconcile the hardware manually. Backend restart marks interrupted manifests ERROR, never resumes a session, and preserves files for inspection. Cancelled/error sessions from earlier processes can remain on disk for manual inspection; no unattended retention purge is implemented.

## Template and output

The original [Frame CAP.pdf](assets/templates/Frame%20CAP.pdf) has two color designs: Coral/Sky (page 1, default) and Blue/Green (page 2). They have slightly different PDF page dimensions. `TEMPLATE_PAGE=2` selects page 2 before backend startup. Exact vector rectangle coordinates and render regeneration are documented in [template configuration](assets/templates/README.md).

Both columns use rows 1–4 for photos 1–4. The same geometry drives progressive JPEG preview and final exports. Contain fitting preserves the entire photo and its aspect ratio, with white bars when needed, and normalizes EXIF orientation. PDF keeps the original artwork and print page dimensions; photos are fitted without cropping and original JPEG streams are embedded unless EXIF rotation requires normalization. Final JPG is 300dpi, quality 95, 4:4:4; originals are never recompressed on save.

Default storage is `<repository>/storage`. Set `$env:STORAGE_ROOT='D:\PhotoboothStorage'` to change it:

```text
storage/
  temp/session-<UUID>/
    capture-01.jpg ... capture-04.jpg
    frame.jpg
    manifest.json
  output/
    photobooth-<UUID>-final.jpg
    photobooth-<UUID>-final.pdf
    photobooth-<UUID>-manifest.json
  hardware-test/<UUID>/
    original.jpg       # only after a confirmed successful hardware capture
    result.json
```

Failed/uncertain native transfers remain under `temp/bridge-...` for operator inspection. An explicit reset of the current session closes the SDK process and waits for exit before removing its registered staging directories. The real adapter remains fault-locked until reconciliation/restart. Orphan staging folders from an earlier process require manual inspection/cleanup. Legacy M1 files under `backend/data` or `data` are left untouched. Generated captures, deliverables, hardware reports and native binaries are excluded from Git.

There is no public static route for temporary storage. Original thumbnails, manifests and final downloads require a per-process operator capability cookie. Vite issues it through a loopback-only bootstrap route; WebSocket controls require that cookie plus a localhost Origin. The display connection is read-only even if it sends operator commands. Display snapshots redact paths and technical errors. Only the current frame composition and actual Live View are available to the display on the trusted LAN. This is a local development deployment, not a public authentication/hosting system. Do not expose the backend or use `vite preview` as a production server: the operator bootstrap and proxies are provided by the dev server.

## Nikon SDK and native bridge

The SDK remains outside this repository. Verified installation:

```powershell
$env:NIKON_SDK_ROOT='D:\PhuThanh\Code\NikonSDK\RemoteModuleSDK\S-SDKZ-210BF-ALLIN'
```

The official package requires Windows 11 x64 and Microsoft Visual C++ Redistributable for Visual Studio 2022. Its sample uses VS 2022 v143 / Windows SDK. With VS 2022 C++ Build Tools and CMake installed:

```powershell
npm run camera:build
```

This machine lacked that C++ toolset. The bridge was successfully built using a workspace-local Zig/Clang toolchain instead. To reproduce that tested build (Python needed for tooling only):

```powershell
python -m pip install --target .local/toolchain ziglang==0.17.1
npm run camera:build
```

The Zig path creates an ignored local compatibility header that reorders one enum declaration and removes an unused forward enum reference. Original SDK files are not edited. Windows x64 type/packing assertions are compiled into the bridge. The bridge executable is `native/build/nikon-bridge.exe`; `NIKON_BRIDGE_PATH` can override that location. No Nikon binaries, headers, samples or vendor manuals are committed or redistributed. Nikon license/redistribution permission must be reviewed before packaging.

Close **NX Tether**, Camera Control Pro and Nikon Transfer before connecting with the custom adapter. Only one camera/client is supported. Profile setup verifies the three files required by Nikon's ReadMe under `%LOCALAPPDATA%\Nikon\NXTether`; it copies missing files only and refuses to overwrite different existing files:

```powershell
npm run camera:setup
npm run camera:probe
```

The probe initializes/enumerates/connects and verifies supported JPEG Fine/Large settings without any shutter command. `python tools/inspect-sdk.py` prints PE architecture, runtime dependencies and required export presence. Keep all accompanying SDK DLLs at their external original path.

## Confirmed single-photo hardware test

Stop any REAL_NIKON backend first. Connect and power the Z30 over USB-C, close other camera clients, set up the scene, then run in an interactive laptop terminal:

```powershell
npm run camera:test
```

The tool connects, verifies readiness and JPEG Fine/Large, then asks you to type **CAPTURE ONE REAL PHOTO**. Only that exact interactive confirmation grants one shutter command. There is no `--yes` bypass or automatic retry. It saves the original JPEG and a report with actual image dimensions, SHA-256 and SDK-event timing. Capture/transfer latency is reported separately when CaptureComplete is observed; otherwise those fields are null and total transfer completion time remains available. No physical timing is fabricated.

After a PASSED result, release resources and start real mode with that report:

```powershell
$env:CAMERA_MODE='REAL_NIKON'
$env:NIKON_VALIDATION_FILE='D:\PhotoboothStorage\hardware-test\<UUID>\result.json'
npm run dev
```

Use the actual printed report path (default is under this repo's `storage`). Enabling sessions checks its single-photo status, original JPEG/hash, device identity/version, native/Node bridge source, SDK DLL and installed profile fingerprints. Changed SDK/bridge/device/firmware requires validation again. A failed/missing report keeps Start disabled; no silent mock fallback occurs. The confirmed single-photo test has passed on this Z30. Real four-photo capture/export acceptance has also passed; physical iPad/print checks remain separate.

The documented SDK Live View callback feeds a bounded latest-frame buffer. The display reads `/live-view.jpg` sequentially with 150ms between requests, checks server frame IDs, and automatically reconnects after failures. A request times out after 1.5 seconds; repeated frame IDs older than 3 seconds are hidden. Stale or missing SDK frames return HTTP 503. The legacy MJPEG endpoint remains available with its four-stream limit. Capturing pauses/restarts SDK preview internally. Preview requests never send SDK capture/start commands or advance the countdown. The iPad preserves preview aspect ratio and overlays authoritative countdown/state. No full-resolution capture polling or NX Tether screen scraping is used. Physical iPad confirmation remains separate.

## iPad Wi-Fi and Windows Firewall

Use the same trusted Wi-Fi. Run `ipconfig`, find the laptop's Wi-Fi IPv4 address and open `http://192.168.x.x:5173/display` in Safari. Guest/client isolation can block communication. Keep the laptop awake. Landscape and Add to Home Screen provide a fullscreen-friendly layout without assuming Safari will grant fullscreen permission.

Use the Windows **Private** network profile. Allow Node.js on Private networks, or as administrator add this narrow rule:

```powershell
New-NetFirewallRule -DisplayName 'Photobooth development' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private -RemoteAddress LocalSubnet
```

Vite proxies WebSocket/images/preview to the loopback backend; backend port 3001 needs no inbound rule. Do not disable the firewall. Remove the temporary rule when finished with `Remove-NetFirewallRule -DisplayName 'Photobooth development'`.

## Verification and troubleshooting

```powershell
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm audit
```

Browser tests start isolated mock services on ports 5175/3003 and use `.local/e2e-storage`; leave those ports free. They run real-time countdowns. `BACKEND_PORT` and `FRONTEND_PORT` can override development ports together. Normal CI uses mock SDK boundaries, never physical camera access.

- Operator cannot connect: open localhost on the laptop; LAN clients cannot acquire the operator cookie. Check backend health and restart Vite after changing proxy configuration.
- Camera unavailable: close competing clients, inspect USB/power/device detection, verify SDK profiles, runtime DLLs and x64 bridge. SDK load and USB hardware acceptance are separate checks.
- SDK cannot identify JPEG Fine/Large: inspect the actual supported capability strings and body/firmware; the bridge refuses to guess enum indices.
- Live View missing: read operator Live View status/prohibition error. A placeholder is shown until fresh real frames arrive. Camera capture continues only when readiness is verified.
- Save/output failure: check free space, permissions and hashes. COMPLETE remains blocked. Reset waits for an in-flight transfer; failed cleanup is visible instead of silently succeeding.
- Device disconnected/bridge crashed: ERROR stops new shutters. Preserve uncertain-transfer files, reconcile the camera, restart and repeat validation as required.

Physical iPad Safari, printing and crop/pose suitability still need operator acceptance. Single-photo Nikon capture/transfer and real Live View in WebKit have now been observed. The full workflow was tested in Chromium; WebKit also passed an iPad-sized touch-viewport test for countdown, reconnection, active reset and read-only controls. Neither test uses a physical iPad.

## M2E hardware result (2026-11-07)

PASSED report: `storage/hardware-test/040344af-4f6e-4424-9db4-297a0864d194/result.json`; original: `original.jpg` in the same private directory. Actual JPEG is 5568x3712 and 7,224,414 bytes. ImageSaved arrived at 743ms; CaptureComplete callback arrived at 755ms, so a separate transfer duration is unavailable (`transferMs: null`), not invented. The SDK size label says L(3984x2656), but actual decoded pixels are authoritative. Device version `common` is not body firmware; validation additionally binds the Windows USB device identity hash.

The first authorized shot exposed successfully but was card-only and timed out waiting for host transfer. The operator separately authorized a new shot after the fix. Configuration now explicitly sets and reads back SaveMedia Card + SDRAM (2), registers the per-capture save path, and rejects card-only mode. Nikon transport DLL search registration lasts through SDK teardown. Before any shooting job, this Z30 SDK returns S_FALSE with status FinishedOrNotStarted; readiness is confirmed through the advertised DeviceReady process, not assumed from S_FALSE.

## M2F real four-photo result (2026-11-07)

Session `81c215e9-9632-4d26-b426-81a27e73e7cf` reached COMPLETE from exactly one START command, with four distinct verified 5568x3712 originals. Every shutter followed its own full server deadline (7.49-12.93ms late, none early). The operator and WebKit display reached COMPLETE and final JPG/PDF downloads were verified. Outputs are `storage/output/photobooth-81c215e9-9632-4d26-b426-81a27e73e7cf-final.jpg` (739,156 bytes), `-final.pdf` (31,418,808 bytes), and `-manifest.json`. The PDF rendered correctly at the original 419.528015x595.276001pt page size.

Live checks rejected an unconfirmed completed-session RESET and a display-side RESET; final file hashes stayed unchanged. Public original-image access returned 403. Busy reset/cleanup is covered by mock SDK tests; a destructive retake of the real completed output was intentionally not performed. Private evidence is in `storage/hardware-test/m2f-confirmed-four-photo-2.json` and `m2f-output-protection.json`.
