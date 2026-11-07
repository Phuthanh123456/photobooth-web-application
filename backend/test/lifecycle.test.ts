import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, access, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { SessionEngine } from '../src/engine.js';
import { FileSessionStorage } from '../src/storage.js';
import type { NikonCameraAdapter } from '../src/camera.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(),'photobooth-lifecycle-')); roots.push(root);
  const jpeg = await sharp({create:{width:300,height:200,channels:3,background:'#284e65'}}).jpeg().toBuffer();
  const camera: NikonCameraAdapter = { kind:'mock', waitUntilReady:async () => {}, capture:vi.fn(async () => ({bytes:jpeg,extension:'jpg' as const})) };
  const storage = new FileSessionStorage(root);
  let now = 0;
  const engine = new SessionEngine(camera,storage,{now:()=>now,sleep:async ms=>{now+=ms;}});
  return {root,camera,storage,engine,jpeg};
}
it('completes only after final JPG, PDF and manifest are verified; starting again preserves completed output', async () => {
  const {engine,storage} = await setup();
  engine.start(); await engine.settled(); const first = engine.snapshot(); const id = first.sessionId!;
  expect(first.status).toBe('COMPLETE'); expect(first.output).toBeDefined();
  const manifest = JSON.parse(await readFile(storage.outputFile(id,'manifest'),'utf8'));
  expect(manifest.captures).toHaveLength(4); expect(manifest.deliverables.jpg.sha256).toHaveLength(64);
  expect(() => engine.requestReset()).toThrow('Confirm deletion');
  engine.start(); engine.cancel(); await engine.settled();
  await expect(access(storage.outputFile(id,'jpg'))).resolves.toBeUndefined();
  await expect(access(storage.sessionDirectory(id))).rejects.toThrow();
  await engine.requestReset(); expect(engine.snapshot().status).toBe('IDLE');
  await expect(access(storage.outputFile(id,'pdf'))).resolves.toBeUndefined();
},20_000);
it('confirmed retake deletes only the current completed session deliverables', async () => {
  const {engine,storage,root} = await setup();
  const sentinel = path.join(root,'unrelated.txt'); await writeFile(sentinel,'keep');
  engine.start(); await engine.settled(); const id = engine.snapshot().sessionId!;
  await engine.requestReset(true);
  expect(engine.snapshot().sessionId).toBeNull();
  for (const kind of ['jpg','pdf','manifest'] as const) await expect(access(storage.outputFile(id,kind))).rejects.toThrow();
  await expect(access(storage.sessionDirectory(id))).rejects.toThrow(); expect(await readFile(sentinel,'utf8')).toBe('keep');
  expect(() => storage.sessionDirectory('../escape')).toThrow('Invalid session');
  await expect(storage.cleanup('../escape',true)).rejects.toThrow('Invalid session');
},20_000);
it('reset while a shutter is in flight waits for transfer and prevents late callbacks restoring deleted captures', async () => {
  const {engine,storage,camera,jpeg} = await setup();
  let resolveCapture!: (value: {bytes:Buffer;extension:'jpg'})=>void;
  vi.mocked(camera.capture).mockImplementation(() => new Promise(resolve => { resolveCapture=resolve; }));
  engine.start();
  await vi.waitFor(() => expect(camera.capture).toHaveBeenCalledTimes(1));
  const id=engine.snapshot().sessionId!; const reset=engine.requestReset();
  expect(() => engine.start()).toThrow();
  resolveCapture({bytes:jpeg,extension:'jpg' as const}); await reset;
  expect(engine.snapshot().status).toBe('IDLE'); expect(engine.snapshot().captures).toEqual([]);
  await expect(access(storage.sessionDirectory(id))).rejects.toThrow();
  expect(camera.capture).toHaveBeenCalledTimes(1);
});
it('final output failure blocks COMPLETE and cleanup removes unfinished drafts', async () => {
  const {engine,storage} = await setup();
  vi.spyOn(storage,'finalize').mockImplementation(async state => {
    await writeFile(path.join(storage.sessionDirectory(state.sessionId!),'draft.tmp'),'unfinished'); throw new Error('Disk full during final output');
  });
  engine.start(); await engine.settled(); const id=engine.snapshot().sessionId!;
  expect(engine.snapshot().status).toBe('ERROR'); expect(engine.snapshot().output).toBeUndefined();
  await engine.requestReset(); await expect(access(storage.sessionDirectory(id))).rejects.toThrow();
},20_000);
it('detects interrupted sessions on restart and never resumes an uncertain shutter', async () => {
  const {engine,storage} = await setup();
  engine.start(); engine.cancel(); await engine.settled();
  await storage.manifest({...engine.snapshot(),status:'CAPTURING',busy:true});
  const interrupted = await storage.recoverInterrupted(); expect(interrupted?.status).toBe('ERROR');
  engine.restoreInterrupted(interrupted!); expect(() => engine.start()).toThrow();
  await engine.requestReset(); expect(engine.snapshot().status).toBe('IDLE');
});
it('save rejects bogus JPEG input without creating a verified record', async () => {
  const {engine,storage} = await setup(); engine.start(); engine.cancel(); await engine.settled();
  await expect(storage.save(engine.snapshot().sessionId!,1,{bytes:Buffer.from('<svg/>'),extension:'jpg'})).rejects.toThrow('JPEG');
});
