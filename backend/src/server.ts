import express from 'express';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerEvent } from '@photobooth/shared';
import type { SessionEngine } from './engine.js';
import { templateDirectory } from './composition.js';
import path from 'node:path';

export function createPhotoboothServer(engine: SessionEngine, imageRoot: string) {
  const app = express();
  app.get('/health', (_req, res) => res.json({ ok: true, camera: 'mock' }));
  app.use('/templates', express.static(templateDirectory, { index: false }));
  app.get('/media/:sessionId/frame', (req, res) => {
    if (req.params.sessionId !== engine.snapshot().sessionId) { res.sendStatus(404); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(imageRoot, req.params.sessionId, 'frame.jpg'));
  });
  app.use('/images', express.static(imageRoot, { dotfiles: 'deny', index: false, setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const seenCommands = new Set<string>();
  const send = (ws: WebSocket, event: ServerEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
      ws.send(JSON.stringify(event));
    }
  };
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const operator = url.searchParams.get('role') === 'operator';
    let localOrigin = false;
    try { localOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.headers.origin ?? '').hostname); } catch { /* deny controls */ }
    if (operator && !localOrigin) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.on('error', () => {});
      send(ws, { type: 'STATE', state: engine.snapshot() });
      ws.on('message', raw => {
        let requestId = '';
        try {
          const command: unknown = JSON.parse(raw.toString());
          if (!command || typeof command !== 'object' || !('requestId' in command) || typeof command.requestId !== 'string' || command.requestId.length > 100 || !('type' in command)) throw new Error('Invalid command');
          requestId = command.requestId;
          if (!operator) throw new Error('Display connection is read-only');
          if (seenCommands.has(requestId)) throw new Error('Duplicate command rejected');
          seenCommands.add(requestId);
          if (seenCommands.size > 10_000) seenCommands.delete(seenCommands.values().next().value!);
          switch (command.type) {
            case 'START': engine.start(); break;
            case 'CANCEL': engine.cancel(); break;
            case 'RESET': engine.reset(); break;
            default: throw new Error('Unknown command');
          }
          send(ws, { type: 'COMMAND_RESULT', requestId, ok: true });
        } catch (error) { send(ws, { type: 'COMMAND_RESULT', requestId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
      });
    });
  });
  const broadcast = () => { for (const ws of wss.clients) send(ws, { type: 'STATE', state: engine.snapshot() }); };
  engine.on('state', broadcast);
  // Heartbeats also detect a silent network loss in the browser; they never advance the engine.
  const heartbeat = setInterval(broadcast, 1000);
  server.on('close', () => { clearInterval(heartbeat); engine.off('state', broadcast); wss.close(); });
  return { server, wss };
}
