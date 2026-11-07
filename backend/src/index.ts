import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockCameraAdapter } from './camera.js';
import { FileSessionStorage } from './storage.js';
import { SessionEngine } from './engine.js';
import { createPhotoboothServer } from './server.js';
const root = process.env.STORAGE_ROOT ? path.resolve(process.env.STORAGE_ROOT) : path.resolve(fileURLToPath(new URL('../data/sessions', import.meta.url)));
const engine = new SessionEngine(new MockCameraAdapter(), new FileSessionStorage(root));
const { server, wss } = createPhotoboothServer(engine, root);
const port = Number(process.env.BACKEND_PORT ?? 3001);
server.listen(port, '127.0.0.1', () => console.log(`Photobooth backend: http://localhost:${port}; storage:`, root));
async function shutdown() {
  if (engine.snapshot().busy && !['CANCELLED', 'ERROR'].includes(engine.snapshot().status)) engine.cancel();
  await engine.settled();
  for (const client of wss.clients) client.terminate();
  server.close();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
