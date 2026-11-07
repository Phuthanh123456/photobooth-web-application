import { once } from 'node:events';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { ServerEvent } from '@photobooth/shared';
import { SessionEngine } from '../src/engine.js';
import { FileSessionStorage } from '../src/storage.js';
import { MockCameraAdapter } from '../src/camera.js';
import { createPhotoboothServer } from '../src/server.js';
let root: string; let engine: SessionEngine; let host: ReturnType<typeof createPhotoboothServer>; let url: string;
const clients: WebSocket[] = [];
function connect(role: string) {
  const ws = new WebSocket(`${url}?role=${role}`, { origin: 'http://localhost:5173', headers: { Cookie: `photobooth_operator=${host.operatorToken}` } }); clients.push(ws);
  return ws;
}
function event(ws: WebSocket, matches: (e: ServerEvent) => boolean): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.off('message', listener); reject(new Error('WebSocket event timeout')); }, 3000);
    function listener(raw: Buffer) { const e = JSON.parse(raw.toString()) as ServerEvent; if (matches(e)) { clearTimeout(timeout); ws.off('message', listener); resolve(e); } }
    ws.on('message', listener);
  });
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(),'photobooth-ws-'));
  engine = new SessionEngine(new MockCameraAdapter(),new FileSessionStorage(root));
  host = createPhotoboothServer(engine,root); host.server.listen(0,'127.0.0.1'); await once(host.server,'listening');
  url = `ws://127.0.0.1:${(host.server.address() as AddressInfo).port}/ws`;
});
afterEach(async () => {
  if (engine.snapshot().busy && !['CANCELLED', 'ERROR'].includes(engine.snapshot().status)) engine.cancel(); await engine.settled();
  clients.splice(0).forEach(ws => ws.terminate());
  await new Promise<void>(resolve => host.server.close(() => resolve()));
  await rm(root,{ recursive:true, force:true });
});
it('broadcasts synchronized authoritative deadlines and restores the active session after reconnection', async () => {
  const operator = connect('operator'); await event(operator,e => e.type === 'STATE');
  const display = connect('display'); await event(display,e => e.type === 'STATE');
  const operatorCountdown = event(operator,e => e.type === 'STATE' && e.state.status === 'COUNTDOWN');
  const displayCountdown = event(display,e => e.type === 'STATE' && e.state.status === 'COUNTDOWN');
  operator.send(JSON.stringify({ type:'START',requestId:'start' }));
  const a = await operatorCountdown; const b = await displayCountdown;
  if (a.type !== 'STATE' || b.type !== 'STATE') throw new Error('Expected state');
  expect(a.state.sessionId).toBe(b.state.sessionId); expect(a.state.countdownDeadlineMs).toBe(b.state.countdownDeadlineMs);
  display.close(); await once(display,'close');
  const replacement = connect('display'); const restored = await event(replacement,e => e.type === 'STATE');
  if (restored.type !== 'STATE') throw new Error('Expected state');
  expect(restored.state.sessionId).toBe(a.state.sessionId); expect(restored.state.countdownDeadlineMs).toBe(a.state.countdownDeadlineMs);
  const duplicate = event(operator,e => e.type === 'COMMAND_RESULT' && e.requestId === 'duplicate');
  operator.send(JSON.stringify({type:'START',requestId:'duplicate'})); expect(await duplicate).toMatchObject({ok:false});
  const cancelled = event(replacement,e => e.type === 'STATE' && e.state.status === 'CANCELLED');
  operator.send(JSON.stringify({type:'CANCEL',requestId:'cancel'})); await cancelled;
});
it('rejects controls on a display socket and rejects a remote operator origin', async () => {
  const display = connect('display'); await event(display,e => e.type === 'STATE');
  const denied = event(display,e => e.type === 'COMMAND_RESULT');
  display.send(JSON.stringify({type:'START',requestId:'forbidden'})); expect(await denied).toMatchObject({ok:false}); expect(engine.snapshot().status).toBe('IDLE');
  const remote = new WebSocket(`${url}?role=operator`,{origin:'http://192.168.1.20:5173'}); clients.push(remote);
  const failure = once(remote,'error'); await expect(failure).resolves.toMatchObject([{message:expect.stringContaining('403')}]);
});
it('requires an operator capability even with a forged localhost Origin and protects originals', async () => {
  const untrusted = new WebSocket(`${url}?role=operator`,{origin:'http://localhost:5173'}); clients.push(untrusted);
  await expect(once(untrusted,'error')).resolves.toMatchObject([{message:expect.stringContaining('403')}]);
  const response = await fetch(url.replace('ws://','http://').replace('/ws','/media/anything/photo/1'));
  expect(response.status).toBe(403);
});
it('redacts technical errors and storage paths from display snapshots', async () => {
  const display = connect('display'); const snapshot=await event(display,e=>e.type==='STATE');
  if(snapshot.type !== 'STATE') throw new Error('Expected snapshot');
  expect(snapshot.state.outputFolder).toBeUndefined(); expect(snapshot.state.output).toBeUndefined();
});
