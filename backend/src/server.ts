import express from 'express';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerEvent } from '@photobooth/shared';
import type { SessionEngine } from './engine.js';
import { templateDirectory } from './composition.js';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { FileSessionStorage, validSessionId } from './storage.js';
import type { NikonCameraAdapter } from './camera.js';
import { previewJpeg } from './preview-jpeg.js';
import type { DesktopSave } from './desktop-save.js';
import {createShareRouter,shareInfo,shareOrigin} from './sharing.js';

export function createPhotoboothServer(engine: SessionEngine, imageRoot: string, storage = new FileSessionStorage(imageRoot), camera?:NikonCameraAdapter, desktopSave?:DesktopSave,publicOrigin?:string) {
  const app = express();
  const origin=shareOrigin(publicOrigin);
  app.use('/s',createShareRouter(storage,origin));
  const operatorToken = randomBytes(32).toString('hex');
  const authorized = (cookie?: string) => cookie?.split(';').some(part => part.trim() === `photobooth_operator=${operatorToken}`) ?? false;
  const operators = new WeakSet<WebSocket>();
  app.get('/internal/operator-token', (_req, res) => res.setHeader('Cache-Control','no-store').json({ token:operatorToken }));
  app.get('/health', (_req, res) => res.json({ ok: true, camera: engine.snapshot().camera, mode:engine.snapshot().cameraMode, ready:engine.snapshot().canStartSession }));
  let streams=0;
  app.get('/live-view.jpg', (_req,res) => {
    res.setHeader('Cache-Control','no-store');
    const frame=camera?.latestFrame;
    if(camera?.kind!=='nikon' || !frame || performance.now()-frame.at>3000) {res.sendStatus(503);return;}
    const jpeg=previewJpeg(frame.bytes);
    if(!jpeg) {res.sendStatus(503);return;}
    res.setHeader('X-Frame-Id',String(frame.at));
    res.type('jpeg').send(jpeg);
  });
  app.get('/live-view.mjpg',(req,res)=> {
    if(camera?.kind!=='nikon' || !camera.latestFrame || performance.now()-camera.latestFrame.at>3000) {res.sendStatus(503);return;}
    if(streams>=4) {res.sendStatus(429);return;}
    streams++;
    res.setHeader('Content-Type','multipart/x-mixed-replace; boundary=frame'); res.setHeader('Cache-Control','no-store'); res.flushHeaders();
    let lastAt=-1;
    const interval=setInterval(()=> {
      const frame=camera.latestFrame;
      if(!frame || performance.now()-frame.at>3000) {res.end();return;}
      if(frame.at===lastAt || res.writableLength>2*1024*1024) return;
      lastAt=frame.at;
      const jpeg=previewJpeg(frame.bytes);
      if(!jpeg) {res.end();return;}
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);res.write(jpeg);res.write('\r\n');
    },120);
    res.on('close',()=>{clearInterval(interval);streams--;});
  });
  app.use('/templates', express.static(templateDirectory, { index: false }));
  app.get('/media/:sessionId/frame', (req, res) => {
    if (req.params.sessionId !== engine.snapshot().sessionId) { res.sendStatus(404); return; }
    res.setHeader('Cache-Control', 'no-store');
    const state = engine.snapshot();
    res.sendFile(state.output && state.status === 'COMPLETE' ? storage.outputFile(req.params.sessionId,'jpg') : path.join(storage.sessionDirectory(req.params.sessionId), 'frame.jpg'), {dotfiles:'allow'});
  });
  app.get('/media/:sessionId/photo/:photo', (req, res) => {
    if (!authorized(req.headers.cookie)) { res.sendStatus(403); return; }
    if (req.params.sessionId !== engine.snapshot().sessionId || !/^[1-4]$/.test(req.params.photo)) { res.sendStatus(404); return; }
    res.setHeader('Cache-Control', 'no-store');
    const record = engine.snapshot().captures[Number(req.params.photo)-1];
    if (record?.status !== 'saved' || !record.file) { res.sendStatus(404); return; }
    res.sendFile(path.join(storage.sessionDirectory(req.params.sessionId), record.file), {dotfiles:'allow'});
  });
  app.get('/images/:sessionId/manifest.json', (req,res) => {
    if (!authorized(req.headers.cookie)) { res.sendStatus(403); return; }
    if (req.params.sessionId !== engine.snapshot().sessionId) { res.sendStatus(404); return; }
    res.setHeader('Cache-Control','no-store'); res.sendFile(path.join(storage.sessionDirectory(req.params.sessionId),'manifest.json'), {dotfiles:'allow'});
  });
  app.get('/media/:sessionId/output/:kind', (req,res) => {
    if (!authorized(req.headers.cookie)) { res.sendStatus(403); return; }
    if (!validSessionId(req.params.sessionId) || !['jpg','pdf','manifest'].includes(req.params.kind)) { res.sendStatus(404); return; }
    const file = storage.outputFile(req.params.sessionId,req.params.kind as 'jpg'|'pdf'|'manifest');
    res.setHeader('Cache-Control','no-store'); res.download(file, path.basename(file), {dotfiles:'allow'});
  });
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const seenCommands = new Set<string>();
  const send = (ws: WebSocket, event: ServerEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
      if(event.type==='STATE') event={...event,state:{...event.state,share:shareInfo(event.state,origin),desktopSave:operators.has(ws) ? desktopSave?.snapshot(event.state.sessionId) : undefined}};
      if (event.type === 'STATE' && !operators.has(ws)) {
        event = { ...event, state: { ...event.state, error:event.state.error ? 'Please wait for assistance' : undefined, outputFolder:undefined, output:undefined,
          captures:event.state.captures.map(c => ({ photo:c.photo, status:c.status })), cameraStatus:undefined, liveViewStatus:undefined } };
      }
      ws.send(JSON.stringify(event));
    }
  };
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const operator = url.searchParams.get('role') === 'operator';
    let localOrigin = false;
    try { localOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.headers.origin ?? '').hostname); } catch { /* deny controls */ }
    if (operator && (!localOrigin || !authorized(req.headers.cookie))) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      if (operator) operators.add(ws);
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
            case 'SAVE_AS':
              if(!desktopSave) throw new Error('Laptop Save As is disabled');
              if(!('sessionId' in command) || command.sessionId!==engine.snapshot().sessionId || engine.snapshot().status!=='COMPLETE') throw new Error('Only the current completed session can be saved');
              desktopSave.request(engine.snapshot().sessionId!);break;
            case 'RESET':
              if (!('sessionId' in command) || command.sessionId !== engine.snapshot().sessionId) throw new Error('Session changed; review it before resetting');
              if(['queued','choosing','saving'].includes(desktopSave?.snapshot(engine.snapshot().sessionId)?.status ?? '')) throw new Error('Finish or cancel the Save As window before retaking this session');
              void engine.requestReset('confirmDeleteCompleted' in command && command.confirmDeleteCompleted === true); break;
            default: throw new Error('Unknown command');
          }
          send(ws, { type: 'COMMAND_RESULT', requestId, ok: true });
        } catch (error) { send(ws, { type: 'COMMAND_RESULT', requestId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
      });
    });
  });
  const broadcast = () => { for (const ws of wss.clients) send(ws, { type: 'STATE', state: engine.snapshot() }); };
  engine.on('state', broadcast);
  desktopSave?.on('change',broadcast);
  // Heartbeats also detect a silent network loss in the browser; they never advance the engine.
  const heartbeat = setInterval(broadcast, 1000);
  server.on('close', () => { clearInterval(heartbeat); engine.off('state', broadcast); desktopSave?.off('change',broadcast); wss.close(); });
  return { server, wss, operatorToken };
}
