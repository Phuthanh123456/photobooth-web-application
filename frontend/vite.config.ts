import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const backend = `http://127.0.0.1:${process.env.BACKEND_PORT ?? 3001}`;
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: Number(process.env.FRONTEND_PORT ?? 5173), strictPort: true, proxy: {
  '/ws': { target: backend, ws: true }, '/media': backend, '/templates': backend, '/images': backend, '/health': backend,
} } });
