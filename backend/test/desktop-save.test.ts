import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {SessionState} from '@photobooth/shared';
import {DesktopSave,saveVerifiedCopy,type SaveDialog} from '../src/desktop-save.js';
import {FileSessionStorage} from '../src/storage.js';
import {SessionEngine} from '../src/engine.js';
import {MockCameraAdapter} from '../src/camera.js';
let root:string,storage:FileSessionStorage,jpeg:Buffer,id:string;
beforeEach(async()=> {
  root=await mkdtemp(path.join(os.tmpdir(),'cap-desktop-save-'));storage=new FileSessionStorage(root);id=randomUUID();
  jpeg=await sharp({create:{width:64,height:32,channels:3,background:'red'}}).jpeg().toBuffer();
  await mkdir(storage.outputFolder,{recursive:true});await writeFile(storage.outputFile(id,'jpg'),jpeg);
});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
const completed=(id:string)=>({sessionId:id,status:'COMPLETE',output:{jpgUrl:'jpg',pdfUrl:'pdf',manifestUrl:'manifest'}} as SessionState);
it('opens exactly once after COMPLETE, never for partial results, and preserves the original on cancel',async()=> {
  const dialog=vi.fn<SaveDialog>(async()=>null),save=new DesktopSave(storage,dialog);
  save.observe({...completed(id),status:'SAVING'});save.observe({...completed(id),status:'COMPOSING'});
  expect(dialog).not.toHaveBeenCalled();
  for(let i=0;i<20;i++) save.observe(completed(id));
  await save.settled();save.observe(completed(id));await save.settled();
  expect(dialog).toHaveBeenCalledOnce();expect(save.snapshot(id)?.status).toBe('cancelled');
  expect(await readFile(storage.outputFile(id,'jpg'))).toEqual(jpeg);
});
it('saves a verified copy and remembers the folder for the next dialog',async()=> {
  const target=path.join(root,'my-created-folder');await mkdir(target);
  const dialog=vi.fn<SaveDialog>().mockResolvedValueOnce({path:path.join(target,'my-photo.jpg'),overwriteConfirmed:false}).mockResolvedValueOnce(null);
  const save=new DesktopSave(storage,dialog);save.observe(completed(id));await save.settled();
  expect(save.snapshot(id)).toMatchObject({status:'saved',path:path.join(target,'my-photo.jpg')});
  expect(await readFile(path.join(target,'my-photo.jpg'))).toEqual(jpeg);
  expect(await readFile(storage.outputFile(id,'jpg'))).toEqual(jpeg);
  save.request(id);await save.settled();expect(dialog.mock.calls[1][0].directory).toBe(target);
});
it('does not overwrite an existing file without the native dialog confirmation',async()=> {
  const target=path.join(root,'existing.jpg');await writeFile(target,'keep me');
  await expect(saveVerifiedCopy(storage.outputFile(id,'jpg'),{path:target,overwriteConfirmed:false})).rejects.toThrow();
  expect(await readFile(target,'utf8')).toBe('keep me');
  await saveVerifiedCopy(storage.outputFile(id,'jpg'),{path:target,overwriteConfirmed:true});
  expect(await readFile(target)).toEqual(jpeg);
});
it('rejects duplicate save requests while the dialog is open and does not automatically retry errors',async()=> {
  let reject!:(error:Error)=>void;
  const dialog=vi.fn<SaveDialog>(()=>new Promise((_ok,fail)=>{reject=fail;}));
  const save=new DesktopSave(storage,dialog);save.observe(completed(id));
  await vi.waitFor(()=>expect(save.snapshot(id)?.status).toBe('choosing'));
  expect(()=>save.request(id)).toThrow('already');
  reject(new Error('Dialog failed'));await save.settled();save.observe(completed(id));
  expect(save.snapshot(id)?.status).toBe('error');expect(dialog).toHaveBeenCalledOnce();
  expect(await readFile(storage.outputFile(id,'jpg'))).toEqual(jpeg);
});
it('closes an open dialog on shutdown without altering the verified output',async()=> {
  const dialog:SaveDialog=(_request,signal)=>new Promise((_ok,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  const save=new DesktopSave(storage,dialog);save.observe(completed(id));
  await vi.waitFor(()=>expect(save.snapshot(id)?.status).toBe('choosing'));
  await save.close();expect(save.snapshot(id)?.status).toBe('cancelled');
  expect(await readFile(storage.outputFile(id,'jpg'))).toEqual(jpeg);
});
it('opens Save As automatically after all four photos and final JPG/PDF verification',async()=> {
  const destination=path.join(root,'completed-session.jpg');
  const dialog=vi.fn<SaveDialog>(async()=> {
    expect(engine.snapshot().status).toBe('COMPLETE');
    expect(engine.snapshot().captures.every(c=>c.status==='saved')).toBe(true);
    const output=engine.snapshot().output!;
    expect(output.jpgUrl).toBeTruthy();expect(output.pdfUrl).toBeTruthy();
    return {path:destination,overwriteConfirmed:false};
  });
  const save=new DesktopSave(storage,dialog);let now=0;
  const engine=new SessionEngine(new MockCameraAdapter(),storage,{now:()=>now,sleep:async ms=>{now+=ms;}});
  engine.on('state',()=>save.observe(engine.snapshot()));
  engine.start();await engine.settled();await save.settled();
  const session=engine.snapshot();expect(dialog).toHaveBeenCalledOnce();
  expect(save.snapshot(session.sessionId)?.status).toBe('saved');
  expect(await readFile(destination)).toEqual(await readFile(storage.outputFile(session.sessionId!,'jpg')));
});
