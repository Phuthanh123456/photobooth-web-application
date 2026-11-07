# University media photobooth

M0 architecture scaffold. Mock camera only; no Nikon SDK integration. M1 supplies the four-photo engine and two synchronized screens.

Requires Node.js 22.12+ (Node 24 recommended) and npm. From the repository root:

```powershell
npm install
npm run dev
```

Separate processes: `npm run dev:backend` and `npm run dev:frontend`. Check with `npm run build` and, after M1, `npm test`.

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
