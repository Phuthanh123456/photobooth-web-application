# Milestones

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
