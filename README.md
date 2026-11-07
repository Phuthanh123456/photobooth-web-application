# University media photobooth

M0 and M1 implemented. Mock camera only; no Nikon SDK integration. The backend runs an operator-controlled, four-photo session and synchronizes both screens over WebSocket.

Requires Node.js 22.12+ (Node 24 recommended) and npm. From the repository root:

```powershell
npm install
npm run dev
```

Separate processes: `npm run dev:backend` and `npm run dev:frontend`. Check with `npm run build` and `npm test`.

Browser integration test (Chromium):

```powershell
npx playwright install chromium
npm run test:e2e
```

The browser test starts its own dev servers, so stop existing servers first. It runs a real-time four-photo session (about 41 seconds), checks an iPad-sized display, reload/reconnection, cancellation, the saved manifest, and narrow-screen layout. Backend tests use virtual monotonic time for precise boundaries and actual filesystem/WebSocket integration tests for persistence and reconnection.

## Operator workflow

Open `/operator` on the laptop using **localhost**, then `/display` on the iPad using the laptop's LAN IP. Start Session is enabled only when connected and ready. Each of four images gets a new 10,000 ms countdown. Start is rejected while a session is running. Cancel prevents further shutters; an exposed image still finishes saving. Wait for the operation to settle, then use **Acknowledge & reset** after cancellation or error. ERROR never retries or resumes automatically; inspect the camera/storage before acknowledging. A new start creates a new UUID and new directory.

The `/display` connection is read-only at the protocol level. Operator connections require a localhost browser Origin; the backend binds to loopback and Vite forwards traffic. This is a trusted-LAN development boundary, not user authentication. A browser on the iPad's LAN URL cannot open an operator connection. There is no capture control on the display.

## Architecture and timing

`shared/src/index.ts` defines states, commands and snapshot contracts. `backend/src/engine.ts` owns the session and camera lock. `camera.ts` defines the future Nikon adapter contract and mock implementation. `storage.ts` writes images, reads them back, checks size/SHA-256, and atomically replaces the manifest. `server.ts` handles WebSocket snapshots and command validation. React only renders state.

The sequence is `IDLE → COUNTDOWN → CAPTURING → SAVING`, repeated four times, then `COMPLETE`. Cancellation and failures terminate the sequence as `CANCELLED` or `ERROR`. The lock stays held through capture, saving, verification and manifest persistence. The next countdown starts after save confirmation and readiness, without an added inter-photo delay. Before COMPLETE, all four records must identify distinct verified files.

Timing uses Node's monotonic `performance.now()`. Every countdown deadline is exactly 10,000 ms after its start. No shutter can fire earlier; OS scheduling and disk I/O may make it later. Snapshots include `serverNowMs`, `countdownDeadlineMs`, and server-calculated `remainingSeconds`; monotonic timestamps belong to the current server process, not Unix time. Browser watchdog/reconnect timers monitor connectivity only. Neither screen independently advances countdown seconds or triggers a shutter. Disconnected screens hide stale countdowns, and reconnect gets a fresh authoritative snapshot. Commands are not replayed on reconnect.

Mock images and manifests are stored in `backend/data/sessions/<UUID>/`. The four manifest records begin as pending and include save status, filename, byte count, SHA-256, shutter monotonic timestamp and save wall-clock timestamp when available. Mock files are labeled SVG images; they do not simulate JPEG quality or actual Live View. Data and build/test artifacts are ignored by Git.

No interrupted session is automatically resumed after a backend restart. Existing files remain on disk; inspect an incomplete manifest manually. Keep the server running through a session. Durable recovery, native camera timeouts/reconciliation and all M2 work are deferred until approved.

Frontend: http://localhost:5173/operator and http://localhost:5173/display. Backend health: http://localhost:3001/health. Vite proxies WebSocket and image requests, so the iPad only needs frontend port 5173.

## iPad on local Wi-Fi

Connect laptop and iPad to the same trusted Wi-Fi. Run `ipconfig` on Windows and use the laptop's Wi-Fi IPv4 address: `http://192.168.x.x:5173/display`. Keep the laptop awake. Guest Wi-Fi/client isolation may block device-to-device traffic.

Set Windows network profile to Private. Allow Node.js on Private networks in Windows Defender Firewall, or create a narrowly scoped inbound TCP rule for port 5173 on the Private profile and LocalSubnet. An administrator can run:

```powershell
New-NetFirewallRule -DisplayName 'Photobooth development' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private -RemoteAddress LocalSubnet
```

Do not disable the firewall. Backend port 3001 does not need an inbound rule. Remove the temporary rule when finished with `Remove-NetFirewallRule -DisplayName 'Photobooth development'`.

Use Safari landscape; Add to Home Screen for an app-like fullscreen display. The display contains no session controls. This development system is for a trusted LAN, with no public hosting or authentication system.

See [architecture tasks](TASK_DECOMPOSITION.md), [rules](project_rules.md), and [camera feasibility](CAMERA_FEASIBILITY.md).
