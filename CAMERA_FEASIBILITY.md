# Nikon Z30 SDK feasibility and verified integration status

## Actual inspected package

`D:\PhuThanh\Code\NikonSDK\RemoteModuleSDK\S-SDKZ-210BF-ALLIN`

Read `ReadMe_En.txt`, both Windows headers and Windows sample project/source, and the English MAID basic/common PDFs. No vendor source/manual is copied into Git. The package identifies Remote SDK **v2.1.0**, lists **Z30**, Windows 11 x64, and VC++ Redistributable for VS 2022. The sample project specifies v143 and Windows SDK 10.0. The team’s successful NX Tether demonstration is separate evidence and does not prove this adapter’s hardware behavior.

`Command/English/Z 30UsbMtpE_02.pdf` documents low-level USB MTP. `Module/Win` supplies the higher-level Remote Module SDK, which is selected for this bridge. Implementing USB/MTP transport separately is unnecessary when this module provides documented simplified APIs.

## Verified files and runtime dependencies

- Headers: `Module/Win/HeaderFile/Maid3.h`, `Maid3d1.h`, `NkTypes.h`, `Nkstdint.h`, `NkEndian.h`.
- Runtime: `ControlServiceLayer.dll`, `NkdPTP.dll`, `NkRoyalmile.dll`, `dnssd.dll` in `Module/Win/BinaryFile`.
- Profiles: `DC_PTP_Config.config`, `MaidLayer.config`, `RangeValue.config`, required under `%LOCALAPPDATA%\Nikon\NXTether` by ReadMe. This installation’s three profile hashes matched the supplied SDK during the probe. Different profiles are never overwritten automatically.
- All four DLLs were inspected as PE32+ machine `0x8664`. Imports include Windows system libraries, `MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` and Universal CRT API sets. `NkdPTP` imports `NkRoyalmile`, which imports `dnssd`.
- Required simplified API exports were found in the actual ControlServiceLayer DLL using `tools/inspect-sdk.py`.

No standalone import libraries were present in the inspected Windows package. The SDK sample loads the DLL dynamically; the bridge follows that approach using header-declared function-pointer types.

## API contracts used — actual header declarations are authoritative

The original bridge binds `InitializeSDK`, `FreeSDK`, `EnumDevices`, `ConnectDevice`, `DisconnectDevice`, `GetCapability`, `SetCapability`, `StartShooting`, `GetShootingStatus`, `StartLiveView` and `StopLiveView` from the external DLL. Signatures are taken directly from the supplied typedefs, not invented bindings.

- Initialize registers allocation/free callbacks and the `NkMAIDCSCallback` event, progress, UI, data and Live View callbacks. Enumeration returns `NkMAIDDeviceInfo` including name, ID, availability and version.
- Connect uses the enumerated device ID. The bridge accepts only an available Z30 and supports one connected body.
- Readiness uses the advertised DeviceReady process capability (34010, process type, Start operation) plus fresh device enumeration. On this Z30, GetShootingStatus initially returns S_FALSE with FinishedOrNotStarted; this is not treated as proof of readiness. Successful DeviceReady confirms the body state.
- SaveMedia is explicitly set/read back as Card + SDRAM (2); card-only (0) does not transfer an image to the PC. SetImageVideoSavePath and each shooting request use the unique capture directory.
- JPEG Fine and Large are selected from SDK-supported packed-string enums (`CompressionLevel`, `ImageSize`) and read back. Unknown labels/types fail closed; control values are not guessed from a different camera’s sample tables.
- `StartShooting` takes `MAIDShootingStructure&`, async completion pointer and reference. The bridge zero-initializes this structure, uses `kNkSDKShootingTypeSingle`, autofocus, and a unique absolute `ImageSavePath`.
- MAID basic manual §2.6 explicitly assigns image writing to the SDK and identifies `kNkMAIDEvent_ImageSaved` as PC save notification. The bridge correlates that event to the unique transfer directory, requires one JPEG and finished shooting status, then Node fully decodes/verifies the received original. An old callback cannot satisfy another capture.
- `CaptureComplete` timestamps provide event-based capture latency when present. ImageSaved timestamps provide total/transfer timing. Unobserved capture timing stays null; SDK timing is not a physical shutter sensor measurement.
- Header `LiveViewDataProc` receives `NkMAIDLiveViewData` with `ulLvImageSize` and `pImageData`. The delivered JPEG is copied into a bounded latest-frame slot before releasing callback allocations. Read the header as authoritative: the supplied sample callback return type and some PDF signatures differ from the header.
- Live View checks `LiveViewProhibit`, starts/stops through documented APIs, and pauses before shutter execution. Unsupported/prohibited preview is reported honestly. The MJPEG server uses fresh preview JPEGs only, not full-resolution capture images.
- Shutdown calls DisconnectDevice and FreeSDK and unloads the DLL. Process isolation protects Node from native faults. An SDK UI prompt is cancelled and latches an intervention state instead of guessing a camera decision.

The child process uses a small correlated tab-framed protocol on stdio, with JSON results and base64 preview events. Node allows one outstanding command, validates transferred paths, bounds buffers, times out/kills a stuck bridge and never replays an uncertain shutter. Native capture timeout is 30s; the parent allows at least 35s for that command. Callback frames are coalesced and displayed at at most ~8fps.

## Build and licensing

The SDK sample expects MSVC v143. This machine did not have the C++ toolset/CMake available. A workspace-local Zig/Clang 0.17.1 compiler successfully produced a Windows x64 bridge. A local ignored compatibility header only moves an unchanged enum definition to its declaration site and removes an unused forward enum reference to satisfy standard C++; vendor files remain unmodified. ABI assertions verify Windows pointer/ULONG/wchar sizes and the supplied packed structures. See README for exact build commands. MSVC/CMake configuration is supplied but that toolchain was not executed here.

The extracted ReadMe does not establish a redistribution grant; headers/sample source carry Nikon copyright notices. The original acceptance/license terms must be retained/reviewed by the SDK licensee before distributing a bundle. No permission to redistribute vendor files is assumed. All SDK headers, DLLs, generated local compatibility files and manuals remain outside tracked source. Only our original bridge, wrapper, scripts and paraphrased findings are committed.

## Evidence and remaining hardware gates

**IMPLEMENTED / BUILD VERIFIED:** native bridge; Node real adapter; explicit MOCK/REAL_NIKON selection; no fallback; confirmation-gated hardware CLI; report/fingerprint gate; MJPEG transport and SDK Live View callback/lifecycle code.

**TESTED WITH MOCK SDK:** one/four-photo flow, overlap rejection, uncertain shutter failure/timeout, process crash, invalid transfer paths/JPEGs, camera disconnection, validation gates and preview transport. These are CI boundaries, not physical Nikon results.

**HISTORICAL M2D SDK PROBE:** DLL loading and InitializeSDK/EnumDevices ran against this package. It returned no available Nikon Z30. The test report records failure at detection with shutterCount 0. No real shutter command was issued. NX Tether/competing camera clients were not running when inspected.

**CURRENT M2E ? TESTED WITH REAL NIKON Z30:** confirmed capture and transfer of a verified 5568?3712 JPEG (7,224,414 bytes). Report `storage/hardware-test/040344af-4f6e-4424-9db4-297a0864d194/result.json` passed after safe SDK shutdown. SDK ImageSaved latency 743ms; CaptureComplete callback 755ms. ImageSaved precedes that callback, so a separate transfer duration remains null. Actual Live View streamed at 640?424 and rendered in WebKit.

**NOT TESTED / BLOCKED:** four-photo hardware acceptance, USB removal during exposure, physical iPad Safari and print acceptance. Physical shutters require explicit operator confirmation. REAL_NIKON four-photo sessions remain disabled without a PASSED single-photo report matching current device-reported version, SDK/profile/native and Node bridge hashes and verified original JPEG.

Do not run NX Tether, Camera Control Pro or Nikon Transfer simultaneously. For the hardware test, stop a real-mode backend, close those clients, connect/power the Z30 and run `npm run camera:test` in an interactive terminal. The exact prompt grants one shutter only. Changing any SDK/bridge/profile/device fingerprint requires validation again.

The device version in validation is the SDK-provided NkMAIDDeviceInfo.Version string. Its relationship to actual body firmware still needs confirmation on the physical Z30; no unobserved firmware value is invented. Explicit current-session reset releases a failed native process before cleaning its registered transfer directories. Older orphan transfers are left for manual inspection.

M2E discovered and fixed two real SDK integration issues: retain AddDllDirectory registration for lazily loaded transport modules throughout SDK lifetime, and set SaveMedia=2 for host delivery. The first authorized card-only exposure was not automatically retried; a separately authorized second exposure produced the verified JPEG. Windows USB identity is hashed into the hardware validation fingerprint because NkMAIDDeviceInfo.Version reports `common`, not actual firmware. The SDK reports a generic L(3984x2656) capability label while the decoded original is 5568?3712; do not infer actual pixels from that label.
