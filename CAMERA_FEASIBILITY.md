# Nikon Z30 feasibility — mock only

The team's NX Tether test demonstrated USB Live View, capture, and JPEG Large/Fine transfer on this hardware. That validates the hardware workflow, not this application's SDK integration. No real Nikon SDK is integrated or loaded here.

Nikon's [official SDK information](https://sdk.nikonimaging.com/information/en/) (checked 2026-11-07) lists Z30 in the unified Z-series Remote Module SDK v2.0.0 support list and announces v2.1.0. Obtain the current SDK through [Nikon's application portal](https://sdk.nikonimaging.com/apply/); review its license and actual Windows support, headers, samples and redistribution terms. The image decoding SDK alone is not a remote capture SDK.

Before implementing an approved later milestone:
1. Confirm exact SDK version, Windows 11 x64 runtime/toolchain, Z30 firmware and supported USB capabilities using Nikon's supplied documents and sample app.
2. Build a native Windows bridge (for example a separate C++ process with IPC) around the supplied API. Do not assume a Node.js SDK exists. Define process lifecycle, device discovery, disconnect handling, callback threading and bounded operation timeouts.
3. Prove Live View, one-shot remote shutter, JPEG Large/Fine configuration, transfer-complete callbacks and camera-ready reporting on the actual body. Close NX Tether and other camera clients during these tests.
4. Map transfer completion into capture(), and actual readiness into waitUntilReady(). Persist transferred bytes and verify them before advancing. Correlate callbacks to session/photo IDs and ignore stale callbacks.
5. Document whether cancellation can abort exposure/transfer. An uncertain shutter or bridge timeout must latch ERROR; never resend automatically. Keep the camera locked until its state is reconciled by an operator.
6. Test USB removal, sleep, low battery, full storage, autofocus failure and bridge crash. Confirm exposure/focus configuration with the operator.

M1 mock output is an intentionally labeled SVG test image, not a camera JPEG. Live View is a placeholder. Hardware acceptance remains outstanding.
