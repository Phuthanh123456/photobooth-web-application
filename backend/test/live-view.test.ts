import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createPhotoboothServer } from '../src/server.js';
import { SessionEngine } from '../src/engine.js';
import { FileSessionStorage } from '../src/storage.js';
import type { NikonCameraAdapter } from '../src/camera.js';
let root:string,host:ReturnType<typeof createPhotoboothServer>,url:string;
let camera:NikonCameraAdapter & {latestFrame?:{bytes:Buffer;at:number}};
beforeEach(async()=> {
  root=await mkdtemp(path.join(os.tmpdir(),'photobooth-live-'));
  camera={kind:'nikon',latestFrame:undefined,waitUntilReady:async()=>{},capture:async()=>{throw new Error('No real shutter in this CI test');}};
  const storage=new FileSessionStorage(root);const engine=new SessionEngine(camera,storage);
  host=createPhotoboothServer(engine,root,storage,camera);host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
  url=`http://127.0.0.1:${(host.server.address() as AddressInfo).port}/live-view.mjpg`;
});
afterEach(async()=>{host.server.closeAllConnections();await new Promise<void>(resolve=>host.server.close(()=>resolve()));await rm(root,{recursive:true,force:true});});
it('does not fabricate a preview when the SDK has no frame or its latest frame is stale',async()=> {
  expect((await fetch(url)).status).toBe(503);
  camera.latestFrame={bytes:Buffer.from([255,216,255,217]),at:performance.now()-4000};expect((await fetch(url)).status).toBe(503);
});
it('serves fresh standalone frames, rejects stale frames, and recovers on the next new frame',async()=> {
  const snapshot=url.replace('.mjpg','.jpg');
  expect((await fetch(snapshot)).status).toBe(503);
  const jpeg=await sharp({create:{width:64,height:32,channels:3,background:'red'}}).jpeg().toBuffer();
  const firstAt=performance.now();camera.latestFrame={bytes:jpeg,at:firstAt};
  const first=await fetch(snapshot);expect(first.headers.get('x-frame-id')).toBe(String(firstAt));
  expect(first.headers.get('cache-control')).toBe('no-store');
  expect(Buffer.from(await first.arrayBuffer())).toEqual(jpeg);
  camera.latestFrame.at=performance.now()-4000;
  expect((await fetch(snapshot)).status).toBe(503);
  camera.latestFrame={bytes:jpeg,at:performance.now()};
  expect((await fetch(snapshot)).status).toBe(200);
});
it('streams actual supplied JPEG bytes and ends cleanly after camera disconnection',async()=> {
  const jpeg=await sharp({create:{width:64,height:32,channels:3,background:'blue'}}).jpeg().toBuffer();
  camera.latestFrame={bytes:Buffer.concat([jpeg,Buffer.alloc(8192)]),at:performance.now()};const response=await fetch(url);
  expect(response.headers.get('content-type')).toContain('multipart/x-mixed-replace');
  const reader=response.body!.getReader();const first=await reader.read();const bytes=Buffer.from(first.value!);
  expect(bytes.toString('ascii')).toContain('Content-Type: image/jpeg');expect(bytes.includes(jpeg)).toBe(true);
  expect(bytes.toString('ascii')).toContain(`Content-Length: ${jpeg.length}`);
  expect(bytes.length).toBeLessThan(jpeg.length+512);
  camera.latestFrame=undefined;
  const last=await reader.read();expect(last.done).toBe(true);
});
