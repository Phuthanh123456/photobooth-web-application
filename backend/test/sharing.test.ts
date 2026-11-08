import {beforeAll,afterAll,beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import sharp from 'sharp';
import {createRequire} from 'node:module';
import {WebSocket} from 'ws';
import type {SessionState} from '@photobooth/shared';
import {FileSessionStorage} from '../src/storage.js';
import {SessionEngine} from '../src/engine.js';
import {createPhotoboothServer} from '../src/server.js';
import {createPublicShareServer,shareInfo,shareOrigin} from '../src/sharing.js';
const jsQR=createRequire(import.meta.url)('jsqr') as typeof import('jsqr').default;

const origin='https://photos.example.edu';
let fixture:string,root:string,storage:FileSessionStorage,first:SessionState,second:SessionState,url:string;
let server:Server;
const token=(state:SessionState)=>state.output!.sharePath!.split('/').at(-1)!;
async function seed(target:FileSessionStorage,color:string) {
  const jpeg=await sharp({create:{width:120,height:80,channels:3,background:color}}).jpeg().toBuffer();
  let now=0;const engine=new SessionEngine({kind:'mock',waitUntilReady:async()=>{},capture:async()=>({bytes:jpeg,extension:'jpg'})},target,{now:()=>now,sleep:async ms=>{now+=ms;}});
  engine.start();await engine.settled();expect(engine.snapshot().status).toBe('COMPLETE');return engine.snapshot();
}
beforeAll(async()=> {
  fixture=await mkdtemp(path.join(os.tmpdir(),'cap-share-fixture-'));
  const target=new FileSessionStorage(fixture);first=await seed(target,'red');second=await seed(target,'blue');
},30000);
afterAll(async()=>{await rm(fixture,{recursive:true,force:true});});
beforeEach(async()=> {
  root=await mkdtemp(path.join(os.tmpdir(),'cap-share-'));await cp(fixture,root,{recursive:true});storage=new FileSessionStorage(root);
  server=createPublicShareServer(storage,origin);server.listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});});

it('generates a distinct persistent QR grant for each completed four-photo session',async()=> {
  expect(token(first)).toMatch(/^[A-Za-z0-9_-]{32}$/);expect(token(first)).not.toBe(token(second));
  expect(await storage.ensureShare(first.sessionId!)).toBe(first.output!.sharePath);
  const restarted=new FileSessionStorage(root);
  expect((await restarted.readSharedJpeg(token(first))).sessionId).toBe(first.sessionId);
});
it('encodes the public download page correctly in a decodable QR with a quiet zone',async()=> {
  for(const state of [first,second]) {
    const response=await fetch(`${url}${state.output!.sharePath}/qr.svg`);expect(response.status).toBe(200);
    const {data,info}=await sharp(Buffer.from(await response.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const decoded=jsQR(new Uint8ClampedArray(data),info.width,info.height);
    expect(decoded?.data).toBe(`${origin}${state.output!.sharePath}`);
    expect([...data.subarray(0,4)]).toEqual([255,255,255,255]);
  }
});
it('serves only the matching verified final JPG through the guest page and download',async()=> {
  for(const state of [first,second]) {
    const page=await fetch(`${url}${state.output!.sharePath}`);expect(page.status).toBe(200);
    expect(page.headers.get('x-robots-tag')).toContain('noindex');expect(await page.text()).toContain('Tải ảnh JPG');
    const response=await fetch(`${url}${state.output!.sharePath}/download`);
    expect(response.headers.get('content-disposition')).toContain(`CAP-${state.sessionId}.jpg`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(await readFile(storage.outputFile(state.sessionId!,'jpg')));
  }
});
it('keeps a previous QR usable when a new session starts and clears old temporary captures',async()=> {
  const capture=vi.fn(async()=>{throw new Error('No shutter expected');});let now=0;
  const engine=new SessionEngine({kind:'mock',waitUntilReady:async()=>{},capture},storage,{now:()=>now,sleep:async ms=>{now+=ms;}});
  engine.restoreCompleted(first);engine.start();engine.cancel();await engine.settled();
  expect(capture).not.toHaveBeenCalled();expect((await fetch(`${url}${first.output!.sharePath}/download`)).status).toBe(200);
});
it('revokes the deleted completed session QR while retaining another session link',async()=> {
  await storage.cleanup(first.sessionId!,true);
  expect((await fetch(`${url}${first.output!.sharePath}/download`)).status).toBe(404);
  expect((await fetch(`${url}${second.output!.sharePath}/download`)).status).toBe(200);
});
it('rejects unknown, malformed and traversal tokens without exposing files',async()=> {
  for(const route of ['/s/not-a-token','/s/'+'x'.repeat(32)+'/image.jpg','/s/%2e%2e%5coutput/download','/s/'+token(first)+'/manifest.json']) expect((await fetch(url+route)).status).toBe(404);
});
it('does not share a corrupt JPEG or an incomplete manifest',async()=> {
  await writeFile(storage.outputFile(first.sessionId!,'jpg'),'broken JPEG');
  expect((await fetch(`${url}${first.output!.sharePath}/image.jpg`)).status).toBe(404);
  const file=storage.outputFile(second.sessionId!,'manifest'),manifest=JSON.parse(await readFile(file,'utf8'));manifest.captures.pop();await writeFile(file,JSON.stringify(manifest));
  expect((await fetch(`${url}${second.output!.sharePath}/download`)).status).toBe(404);
});
it('exposes no operator, bootstrap, original-image, SDK or WebSocket routes on the public listener',async()=> {
  for(const route of ['/operator','/display','/operator-api/bootstrap','/internal/operator-token','/ws?role=operator','/live-view.jpg',`/media/${first.sessionId}/photo/1`,`/images/${first.sessionId}/manifest.json`,`/media/${first.sessionId}/output/pdf`]) {
    const response=await fetch(url+route,{headers:{Origin:'http://localhost:5176'}});expect(response.status).toBe(404);
  }
  expect((await fetch(url+'/START',{method:'POST'})).status).toBe(404);
});
it('upgrades an older completed session once without changing its JPG/PDF bytes',async()=> {
  const file=storage.outputFile(first.sessionId!,'manifest'),manifest=JSON.parse(await readFile(file,'utf8'));
  delete manifest.shareToken;await writeFile(file,JSON.stringify(manifest));
  const original=await readFile(storage.outputFile(first.sessionId!,'jpg')),pdf=await readFile(storage.outputFile(first.sessionId!,'pdf'));
  const page=await storage.ensureShare(first.sessionId!);
  expect(await storage.ensureShare(first.sessionId!)).toBe(page);expect(page).not.toBe(first.output!.sharePath);
  expect(await readFile(storage.outputFile(first.sessionId!,'jpg'))).toEqual(original);expect(await readFile(storage.outputFile(first.sessionId!,'pdf'))).toEqual(pdf);
  expect((await storage.readSharedJpeg(page.split('/').at(-1)!)).sessionId).toBe(first.sessionId);
});
it('restores a completed display without shutter, state events or automatic Save As',()=> {
  const capture=vi.fn(async()=>{throw new Error('No shutter expected');});
  const engine=new SessionEngine({kind:'mock',waitUntilReady:async()=>{},capture},storage),event=vi.fn();engine.on('state',event);
  engine.restoreCompleted(first);expect(engine.snapshot().status).toBe('COMPLETE');expect(capture).not.toHaveBeenCalled();expect(event).not.toHaveBeenCalled();
  expect(()=>engine.restoreCompleted({...first,status:'COUNTDOWN',busy:true})).toThrow('Invalid');
});
it('publishes the current QR on display sockets only at COMPLETE and clears it for the next countdown',async()=> {
  const engine=new SessionEngine({kind:'mock',waitUntilReady:async()=>{},capture:async()=>{throw new Error('No shutter');}},storage);
  engine.restoreCompleted(first);const host=createPhotoboothServer(engine,root,storage,undefined,undefined,origin);
  host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
  const socket=new WebSocket(`ws://127.0.0.1:${(host.server.address() as AddressInfo).port}/ws?role=display`);
  try {
    const [raw]=await once(socket,'message');const state=JSON.parse(raw.toString()).state;
    expect(state.share.url).toBe(origin+first.output!.sharePath);expect(state.output).toBeUndefined();expect(state.outputFolder).toBeUndefined();
    const next=once(socket,'message');engine.start();engine.cancel();await engine.settled();const [message]=await next;
    expect(JSON.parse(message.toString()).state.share).toBeUndefined();
  } finally {socket.terminate();await new Promise<void>(resolve=>host.server.close(()=>resolve()));}
});
it('validates share origins and never offers a QR during partial capture states',()=> {
  expect(shareOrigin(origin)).toBe(origin);expect(()=>shareOrigin('http://photos.example.edu')).toThrow('HTTPS');
  expect(()=>shareOrigin('https://photos.example.edu/other')).toThrow('HTTPS');
  expect(shareInfo({...first,status:'COMPOSING'},origin)).toBeUndefined();expect(shareInfo(first)).toBeUndefined();
});
