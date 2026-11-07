import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true }, '/images': 'http://127.0.0.1:3001', '/health': 'http://127.0.0.1:3001' } } });
