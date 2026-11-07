import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { RealNikonCameraAdapter } from '../src/nikon/adapter.js';
import type { BridgeCommand, BridgePort } from '../src/nikon/bridge.js';
import { createCamera, loadHardwareValidation } from '../src/camera-factory.js';
import { SessionEngine } from '../src/engine.js';
import { FileSessionStorage } from '../src/storage.js';

class FakeSDKBridge extends EventEmitter implements BridgePort {
  device={id:30,name:'Nikon Z30',version:'CI-FAKE-SDK'};
  calls:BridgeCommand[]=[];
  respond=vi.fn(async(command:BridgeCommand,arg?:string):Promise<unknown>=> {
    if(command==='INIT') return this.device;
    if(command==='CONFIGURE') return {quality:'JPEG Fine',size:'Large'};
    if(command==='CAPTURE') {
      const directory=Buffer.from(arg!,'base64').toString('utf8'); const file=path.join(directory,'DSC_0001.JPG');
      const jpeg=await sharp({create:{width:300,height:200,channels:3,background:'#206050'}}).jpeg().toBuffer();
      await mkdir(directory,{recursive:true});await writeFile(file,jpeg);
      return {path:file,totalMs:120,captureMs:80,transferMs:40};
    }
    return {};
  });
  async request<T>(command:BridgeCommand,arg?:string):Promise<T> {this.calls.push(command);return await this.respond(command,arg) as T;}
  async close() {}
}
const roots:string[]=[];
afterEach(async()=> {vi.unstubAllEnvs();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function setup() {
  const root=await mkdtemp(path.join(os.tmpdir(),'photobooth-sdk-')); roots.push(root);
  const bridge=new FakeSDKBridge(),camera=new RealNikonCameraAdapter(bridge,path.join(root,'temp'));
  await camera.initialize();return {root,bridge,camera};
}
it('keeps MOCK isolated and never falls back when REAL_NIKON cannot initialize',async()=> {
  const factory=vi.fn(async()=>{throw new Error('SDK unavailable');});
  const mock=await createCamera('unused','MOCK',factory);expect(mock.kind).toBe('mock');expect(factory).not.toHaveBeenCalled();
  const real=await createCamera('unused','REAL_NIKON',factory);expect(real.kind).toBe('nikon');expect(real.canStartSession).toBe(false);
  await expect(real.capture({sessionId:randomUUID(),photo:1})).rejects.toThrow('SDK unavailable');
  await expect(createCamera('unused','TYPO',factory)).rejects.toThrow('implicit fallback');
});
it('requires confirmation for the single shutter and consumes the permission exactly once',async()=> {
  const {camera,bridge}=await setup(); const request={sessionId:randomUUID(),photo:1};
  await expect(camera.capture(request)).rejects.toThrow('confirmation');
  camera.confirmOneHardwareShutter(); const image=await camera.capture(request);
  expect(image.extension).toBe('jpg');expect(camera.diagnostics?.transferMs).toBe(40);
  await expect(camera.capture(request)).rejects.toThrow('confirmation');
  expect(bridge.calls.filter(c=>c==='CAPTURE')).toHaveLength(1);
  expect(()=>camera.assertSessionAllowed()).toThrow('locked');
});
it('latches an uncertain shutter failure, never retries and prevents overlapping commands',async()=> {
  const {camera,bridge}=await setup();camera.confirmOneHardwareShutter();
  let reject!: (error:Error)=>void;
  bridge.respond.mockImplementation(command=>command==='CAPTURE'?new Promise((_resolve,fail)=>{reject=fail;}):Promise.resolve({}));
  const first=camera.capture({sessionId:randomUUID(),photo:1});
  await vi.waitFor(()=>expect(bridge.calls.at(-1)).toBe('CAPTURE'));
  await expect(camera.capture({sessionId:randomUUID(),photo:2})).rejects.toThrow('Overlapping');
  reject(new Error('Uncertain physical shutter timeout'));await expect(first).rejects.toThrow('Uncertain');
  await expect(camera.waitUntilReady()).rejects.toThrow('Uncertain');expect(bridge.calls.filter(c=>c==='CAPTURE')).toHaveLength(1);
});
it('handles native disconnection and removes stale Live View frames',async()=> {
  const {camera,bridge}=await setup();
  bridge.emit('frame',Buffer.from([255,216,255,217]));expect(camera.latestFrame).toBeDefined();
  bridge.emit('fault',new Error('Camera disconnected'));expect(camera.latestFrame).toBeUndefined();
  await expect(camera.waitUntilReady()).rejects.toThrow('disconnected');
});
it('rejects foreign transfer paths and invalid JPEGs',async()=> {
  const {camera,bridge}=await setup();camera.confirmOneHardwareShutter();
  bridge.respond.mockResolvedValue({path:'C:/outside/capture.jpg'});
  await expect(camera.capture({sessionId:randomUUID(),photo:1})).rejects.toThrow('outside');
  const second=await setup();second.camera.confirmOneHardwareShutter();
  second.bridge.respond.mockImplementation(async(_command,arg)=>{const file=path.join(Buffer.from(arg!,'base64').toString(),'bad.jpg');await writeFile(file,'not a jpeg');return {path:file};});
  await expect(second.camera.capture({sessionId:randomUUID(),photo:1})).rejects.toThrow('JPEG');
});
it('validates the report, device, original JPEG and exact SDK fingerprints before enabling sessions',async()=> {
  const {root,camera,bridge}=await setup(); const file=path.join(root,'result.json');
  const jpeg=await sharp({create:{width:64,height:32,channels:3,background:'red'}}).jpeg().toBuffer();await writeFile(path.join(root,'original.jpg'),jpeg);
  const report={test:'single-photo',status:'PASSED',mode:'REAL_NIKON',shutterCount:1,device:bridge.device,original:'original.jpg',width:64,height:32,sha256:createHash('sha256').update(jpeg).digest('hex'),fingerprints:{bridge:'CI-fake-fingerprint'}};
  await writeFile(file,JSON.stringify(report));
  await expect(loadHardwareValidation(file,camera,{bridge:'changed'})).rejects.toThrow('changed');expect(camera.canStartSession).toBe(false);
  await writeFile(file,JSON.stringify({...report,mode:'MOCK'}));await expect(loadHardwareValidation(file,camera,report.fingerprints)).rejects.toThrow('real single-photo');
  await writeFile(file,JSON.stringify(report));await loadHardwareValidation(file,camera,report.fingerprints);expect(camera.canStartSession).toBe(true);
  expect(()=>camera.authorizeValidatedSession({...bridge.device,version:'other'})).toThrow('different device');
});
it('explicit reset releases a failed SDK transfer before deleting only that session staging directory',async()=> {
  const {camera,bridge,root}=await setup();const id=randomUUID();camera.confirmOneHardwareShutter();
  const close=vi.spyOn(bridge,'close');
  bridge.respond.mockImplementation(async(_command,arg)=>{const dir=Buffer.from(arg!,'base64').toString();await writeFile(path.join(dir,'partial.jpg'),'incomplete');throw new Error('Transfer failed');});
  await expect(camera.capture({sessionId:id,photo:1})).rejects.toThrow('Transfer failed');
  expect(await readdir(path.join(root,'temp'))).toHaveLength(1);
  await camera.cleanupSession(id);expect(close).toHaveBeenCalledOnce();
  expect(await readdir(path.join(root,'temp'))).toEqual([]);expect(camera.canStartSession).toBe(false);
});
it('runs the existing four-photo engine through a MOCK SDK boundary with all real-mode gates and output verification',async()=> {
  const {root,camera,bridge}=await setup();camera.authorizeValidatedSession(bridge.device);
  let now=0;const storage=new FileSessionStorage(root);
  const engine=new SessionEngine(camera,storage,{now:()=>now,sleep:async ms=>{now+=ms;}});
  engine.start();await engine.settled();
  const state=engine.snapshot();expect(state.status).toBe('COMPLETE');expect(state.cameraMode).toBe('REAL_NIKON');
  expect(bridge.calls.filter(c=>c==='CAPTURE')).toHaveLength(4);
  expect(state.captures.map(c=>c.shutterAtMs)).toEqual([10000,20000,30000,40000]);
  expect(state.output).toBeDefined();await storage.verify(state.sessionId!,state.captures);
});
