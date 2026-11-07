# Milestones

## M2A — Frame template and composition
- Inspected both supplied PDF pages: two color variants with eight exact vector slots each.
- Original asset, 300dpi artwork and extracted point geometry retained; both columns map rows 1–4 to photos 1–4.
- JPEG mock captures, full JPEG decode verification, progressive frame JPEG and vector-preserving PDF compositor.
- Composition tests cover mapping, progressive rows, PDF print size, high-resolution JPEG and corrupt input.

## M0 — Architecture and setup
- npm workspaces: React 19/Vite frontend, Node/TypeScript backend, shared contracts.
- Camera interface and mock adapter; feasibility and operating rules.
- Build validation and separate M0 commit.

## M1 — Four-photo engine
- Monotonic server timing, serialized camera operations, verified session storage.
- WebSocket snapshots and explicit operator commands; display has read-only connection.
- Operator/display screens; automated engine, storage and WebSocket tests.
- Validate build/tests and separate M1 commit.

## Deferred: M2 and real camera integration
Requires explicit approval. No SDK loading, real shutter, live view, printing, or sharing in M0/M1.

## Implementation evidence
- M0: workspace scripts, typed contracts, adapter boundary, mock and all four documents; build passed. Commit `dea8274`.
- M1: serialized monotonic engine, read-back/hash verification, atomic manifests, error/cancel acknowledgement, authoritative WebSocket snapshots, read-only display, operator UI.
- Validation: `npm test`, `npm run build`, `npm run test:e2e`. The browser test uses real 10-second countdowns; engine tests also verify exact virtual boundaries.
- Final results: 17 backend tests passed, 1 Chromium browser integration test passed (42.9 seconds), TypeScript/Vite build passed, and npm audit reported zero vulnerabilities. Physical iPad/Nikon testing is not part of this mock iteration.
