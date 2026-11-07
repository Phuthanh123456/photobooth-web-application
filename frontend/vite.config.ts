import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const backend = `http://127.0.0.1:${process.env.BACKEND_PORT ?? 3001}`;
export default defineConfig({ plugins: [react(), { name:'local-operator-bootstrap', configureServer(server) {
  server.middlewares.use('/operator-api/bootstrap', async (req,res) => {
    const address = req.socket.remoteAddress ?? '';
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address) || req.headers['sec-fetch-site'] === 'cross-site') { res.statusCode = 403; res.end('Operator access requires this laptop'); return; }
    try {
      const response = await fetch(`${backend}/internal/operator-token`);
      const { token } = await response.json() as { token:string };
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Set-Cookie',`photobooth_operator=${token}; HttpOnly; SameSite=Strict; Path=/`);
      res.end('OK');
    } catch { res.statusCode = 503; res.end('Backend unavailable'); }
  });
} }], server: { host: '0.0.0.0', port: Number(process.env.FRONTEND_PORT ?? 5173), strictPort: true, proxy: {
  '/ws': { target: backend, ws: true }, '/media': backend, '/templates': backend, '/images': backend, '/health': backend, '/live-view.mjpg':backend,
} } });
