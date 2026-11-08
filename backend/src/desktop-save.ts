import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesktopSaveState, SessionState } from '@photobooth/shared';
import { FileSessionStorage, validSessionId } from './storage.js';

const exec = promisify(execFile);
const hash = (bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export interface SaveChoice { path:string; overwriteConfirmed:boolean }
export type SaveDialog = (request:{directory:string;fileName:string},signal:AbortSignal)=>Promise<SaveChoice|null>;

export function windowsSaveDialog(root:string):SaveDialog {
  const script=fileURLToPath(new URL('../../tools/save-jpg-dialog.ps1',import.meta.url));
  return async(request,signal)=> {
    if(process.platform!=='win32') throw new Error('The laptop Save As dialog requires Windows');
    const directory=path.join(root,'desktop-save');await mkdir(directory,{recursive:true});
    const file=path.join(directory,`request-${randomUUID()}.json`);
    await writeFile(file,JSON.stringify(request),{flag:'wx'});
    try {
      const {stdout}=await exec('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',script,'-RequestFile',file],{windowsHide:true,signal,maxBuffer:64*1024});
      const reply=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
      if(reply.status==='cancelled') return null;
      if(reply.status!=='selected' || typeof reply.path!=='string' || typeof reply.overwriteConfirmed!=='boolean') throw new Error('Invalid Save As dialog response');
      return {path:reply.path,overwriteConfirmed:reply.overwriteConfirmed};
    } finally {await rm(file,{force:true});}
  };
}

/** Copies only after a local native dialog selects a target; the verified final stays intact. */
export async function saveVerifiedCopy(source:string,choice:SaveChoice) {
  const target=path.resolve(choice.path);
  if(!path.isAbsolute(choice.path) || !/\.jpe?g$/i.test(target)) throw new Error('Select a JPEG filename ending in .jpg');
  const original=await readFile(source),digest=hash(original);
  if(path.resolve(source).toLowerCase()===target.toLowerCase()) return target;
  const temporary=path.join(path.dirname(target),`.cap-save-${randomUUID()}.tmp`);
  try {
    await copyFile(source,temporary,constants.COPYFILE_EXCL);
    if(hash(await readFile(temporary))!==digest) throw new Error('Copied JPEG verification failed');
    if(choice.overwriteConfirmed) await rename(temporary,target);
    else await copyFile(temporary,target,constants.COPYFILE_EXCL);
    if(hash(await readFile(target))!==digest) throw new Error('Saved JPEG verification failed');
    return target;
  } finally {await rm(temporary,{force:true});}
}

export class DesktopSave extends EventEmitter {
  private states=new Map<string,DesktopSaveState>();
  private queue:Promise<void>=Promise.resolve();
  private abort?:AbortController;
  private closed=false;
  private preferences:string;
  constructor(private storage:FileSessionStorage,private dialog:SaveDialog,private defaultDirectory=storage.outputFolder) {
    super();this.preferences=path.join(storage.root,'preferences','save-dialog.json');
  }
  snapshot(id:string|null) {const state=id ? this.states.get(id) : undefined;return state ? structuredClone(state) : undefined;}
  observe(state:SessionState) {
    if(state.status==='COMPLETE' && state.output && state.sessionId && !this.states.has(state.sessionId)) this.request(state.sessionId);
  }
  request(id:string) {
    if(this.closed || !validSessionId(id)) throw new Error('Desktop saving is unavailable');
    if(['queued','choosing','saving'].includes(this.states.get(id)?.status ?? '')) throw new Error('Save As is already open or queued');
    this.set(id,{status:'queued'});
    this.queue=this.queue.then(()=>this.run(id));
  }
  private set(id:string,state:DesktopSaveState) {this.states.set(id,state);this.emit('change');}
  private async run(id:string) {
    if(this.closed) {this.set(id,{status:'cancelled'});return;}
    this.abort=new AbortController();
    try {
      const source=this.storage.outputFile(id,'jpg');await access(source);
      let directory=this.defaultDirectory;
      try {const previous=JSON.parse(await readFile(this.preferences,'utf8'));if(typeof previous.directory==='string') directory=previous.directory;} catch { /* First save uses the output folder. */ }
      this.set(id,{status:'choosing'});
      const choice=await this.dialog({directory,fileName:`CAP-${id}.jpg`},this.abort.signal);
      if(!choice) {this.set(id,{status:'cancelled'});return;}
      this.set(id,{status:'saving'});
      const saved=await saveVerifiedCopy(source,choice);
      await mkdir(path.dirname(this.preferences),{recursive:true});
      const temporary=`${this.preferences}.tmp`;
      await writeFile(temporary,JSON.stringify({directory:path.dirname(saved)}));await rename(temporary,this.preferences);
      this.set(id,{status:'saved',path:saved});
    } catch(error) {
      this.set(id,this.closed ? {status:'cancelled'} : {status:'error',error:String(error)});
    } finally {this.abort=undefined;}
  }
  async settled() {await this.queue;}
  async close() {this.closed=true;this.abort?.abort();await this.queue;}
}
