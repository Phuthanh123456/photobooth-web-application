import express from 'express';
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, camera: 'mock', milestone: 'M0' }));
app.listen(3001, '0.0.0.0', () => console.log('Mock photobooth backend: http://localhost:3001'));
