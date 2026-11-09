# Implementation and verification report

**Project:** CAP Photobooth
**Verification snapshot:** 2026-11-09

## Delivered system

CAP is an operator-controlled photobooth application for a Windows 11 laptop connected to a Nikon Z30. The laptop owns the session and camera; a read-only tablet display follows the same backend state. The system captures four images with a separate 10-second countdown before each shutter, waits for verified image saves, composes the supplied transparent sticker frame, and produces a finished JPG and PDF.

Completed JPGs can be uploaded to Supabase Storage from the event laptop. A public static guest page resolves a unique QR link and lets guests download that session's image from Wi-Fi or cellular service. The public service has no camera, session-control, operator, original-image, or PDF routes.

## Engineering highlights

- Monotonic, backend-authoritative countdown deadlines and WebSocket state synchronization.
- Duplicate-start rejection, serialized shutter operations, explicit camera readiness checks, cancellation and fail-closed error handling. Uncertain captures are never retried automatically.
- Shared camera contract with deterministic mock and Nikon adapter backed by a separate Windows native bridge. Nikon SDK binaries and profiles are installed on the organizer laptop from Nikon; they are not redistributed in the source or package.
- Verified JPEG transfer, per-session manifests, protected local output, framed JPG/PDF export, and a native Windows Save As flow.
- Durable cloud-upload queue that publishes the QR only after the uploaded JPG is read back and its SHA-256 matches. Upload retries never issue camera commands.
- A scoped event gateway separates the local operator experience, LAN display and guest download surface.

## Validation evidence

At this snapshot, the latest recorded automated checks passed:

- 83 backend tests across the state machine, lifecycle, camera bridge, storage, composition, sharing, and cloud queue.
- 8 browser tests across Chromium and WebKit, including guest-download and display behavior.
- Production gateway integration test for route and credential boundaries.
- Native C++ bridge regression checks and the TypeScript/Vite production build.
- Dependency audit reported zero known vulnerabilities at the time of its run.

Physical validation used a Nikon Z30: a confirmed JPEG capture and host transfer, real Live View, and a complete four-photo session with verified source images and final exports were observed. The Windows event package was also extracted and exercised through a four-photo mock session and graceful shutdown. Cloud configuration was verified on organizer machines by uploading a test JPEG, reading it back with a matching SHA-256, then deleting the test object. The deployed guest page served correctly, and a guest QR download was confirmed over cellular data after the local app stopped. A physical iPad was used to view the completed frame and QR display.

These are recorded acceptance results, not a promise that every camera firmware, network, or tablet/browser combination will behave identically. Ordinary automated tests use mocks and do not trigger a camera shutter. Hardware validation tools require explicit operator confirmation.

## Deployment boundary

The Nikon, state machine, countdown and operator UI stay on the event laptop. The tablet connects to the laptop over the event LAN. Supabase and the static guest site handle only final-photo delivery, allowing guests to scan with 4G/5G. The developer laptop is not part of event runtime. The event organizer must keep the camera laptop powered and connected to the camera throughout the session.

No Nikon SDK vendor binaries, user credentials, cloud secrets, captured photos, hardware reports or local runtime configuration are included in Git. See [HANDOFF_VI.md](HANDOFF_VI.md) for event setup and [CAMERA_FEASIBILITY.md](CAMERA_FEASIBILITY.md) for SDK and hardware notes.

## Remaining scope

- Validate against additional camera bodies, SDK versions, Windows machines and network configurations before broad deployment.
- Exercise physical print output with the target printer and paper.
- Define and implement an event-specific photo retention and deletion schedule; current cloud links remain available until the organizer deletes the corresponding session/object.
- Review Nikon SDK licensing and redistribution rules before any commercial or redistributable release.

The app is an event tool designed for a supervised operator, not a self-service kiosk or a cloud-hosted camera-control product.
