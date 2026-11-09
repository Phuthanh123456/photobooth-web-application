# Nikon Z30 feasibility and integration notes

## Current result

The CAP source includes a real Nikon camera adapter and a Windows native bridge boundary for Nikon's separately installed SDK. A physical Nikon Z30 was used to verify Live View, JPEG capture and transfer to the host, and one four-photo session with verified image records and finished JPG/PDF outputs.

This is a Nikon Z30 implementation. It should not be treated as proof of compatibility with every Nikon body, firmware, SDK release, USB controller, or Windows installation. The SDK remains external and must be obtained and installed by the operator under Nikon's current terms.

## Integration design

```text
TypeScript session engine
  → shared camera interface
  → Nikon TypeScript adapter
  → bounded process/IPC bridge
  → Windows x64 native C++ bridge
  → Nikon Remote SDK and connected Z30
```

The session engine also has a mock adapter for development and automated tests. Real mode fails closed when the expected SDK, device, profiles, or a valid local hardware-validation report is missing. It does not silently switch to mock mode.

The bridge uses Nikon's device discovery when establishing the connection and a connected-device readiness check during the session. This avoids repeating USB discovery while the body is already connected. Live View uses bounded frame handling and stale-frame detection; capture and preview operations are coordinated so they do not overlap camera commands.

## Device and file settings

The tested capture path used JPEG Fine and Large with host transfer enabled. The adapter checks the camera's advertised settings instead of guessing enum values. A saved image is decoded and verified before the session advances. If shutter completion or transfer is uncertain, the session enters an operator-visible error state; there is no automatic shutter retry.

Each event session produces four verified capture records. The original images are retained locally for composition and inspection. The final framed JPG and PDF are separate outputs. Only the verified final JPG is eligible for guest cloud sharing.

## SDK installation and build

1. Obtain the Nikon Z-series Remote SDK from Nikon using an authorized account and accept its terms.
2. Extract/install the SDK on the Windows 11 x64 event laptop. Do not point setup at the ZIP file or only its `Module` subdirectory; use the SDK root containing the documented `Module/Win/BinaryFile` structure.
3. Install the SDK's required Windows runtime and C++ toolchain prerequisites.
4. Connect and power the Z30. Close NX Tether and all other Nikon camera-control applications.
5. Run `Setup Camera.cmd` in the event package, select the external SDK root, and complete the one-photo validation only when the operator explicitly approves the shutter.
6. Run `Start Photobooth.cmd` only after setup and validation report success.

For source development, `tools/build-native.ps1` builds the bridge and `npm run camera:setup`, `npm run camera:probe`, and `npm run camera:test` provide setup, no-shutter probe, and explicitly confirmed single-photo validation. See [README.md](README.md) and [HANDOFF_VI.md](HANDOFF_VI.md).

The repository intentionally excludes Nikon headers, manuals, SDK DLLs, sample binaries and other vendor files. Before distributing any package that includes a Nikon component, review the applicable Nikon license and redistribution terms. The event ZIP includes the project's bridge/runtime components only; the recipient obtains the Nikon SDK separately.

## Known boundaries

- Hardware validation is specific to the connected device and fingerprints the SDK/bridge/profile inputs. A change to those inputs requires validation again.
- Camera readiness and USB behavior can vary with power state, cable, host controller and other software that claims the device.
- USB removal during exposure and exhaustive recovery testing across Windows machines remain additional acceptance work.
- PDF creation is tested in software; physical printer calibration, paper feed and print color are not part of the camera integration test.
- Guest QR delivery requires internet access to the configured cloud destination. Local camera capture and file generation remain on the event laptop.

Automated backend and browser tests use controlled camera mocks. They do not issue real shutter commands. Real-camera tools require an explicit interactive operator confirmation and do not automatically retry an uncertain exposure.
