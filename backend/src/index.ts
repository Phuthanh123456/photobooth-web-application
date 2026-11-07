import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockCameraAdapter } from './camera.js';
import { FileSessionStorage } from './storage.js';
import { SessionEngine } from './engine.js';
import { createPhotoboothServer } from './server.js';
const root = path.resolve(fileURLToPath(new URL('../data/sessions', import.meta.url)));
const engine = new SessionEngine(new MockCameraAdapter(), new FileSessionStorage(root));
const { server, wss } = createPhotoboothServer(engine, root);
server.listen(3001, '127.0.0.1', () => console.log('Mock photobooth backend: http://localhost:3001; photos:', root));
async function shutdown() {
  if (engine.snapshot().busy && !['CANCELLED', 'ERROR'].includes(engine.snapshot().status)) engine.cancel();
  await engine.settled();
  for (const client of wss.clients) client.terminate();
  server.close();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
