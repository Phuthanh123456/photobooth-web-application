import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

export type BridgeCommand = 'INIT' | 'READY' | 'CONFIGURE' | 'CAPTURE' | 'LIVE_START' | 'LIVE_STOP' | 'CLOSE';
export interface BridgePort {
  request<T = unknown>(command: BridgeCommand, argument?: string): Promise<T>;
  close(): Promise<void>;
  on(event: 'frame' | 'previewError' | 'fault', listener: (...args: any[]) => void): unknown;
}
/** Tab-framed child-process protocol. One outstanding command, bounded latest-frame events.
 * A timeout kills the child, latches a fault, and never replays a shutter command. */
export class NativeNikonBridge extends EventEmitter implements BridgePort {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending?: { id: string; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private fault?: Error;
  private closing = false;
  private exited: Promise<void>;
  private resolveExit!: () => void;
  constructor(executable: string, sdkRoot: string, private timeoutMs = 15_000) {
    super();
    this.exited=new Promise(resolve=>{this.resolveExit=resolve;});
    this.child = spawn(executable,[sdkRoot],{ cwd:path.join(sdkRoot,'Module','Win','BinaryFile'), windowsHide:true, stdio:'pipe' });
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data',(chunk: string) => {
      buffer += chunk;
      if (buffer.length > 8*1024*1024) { this.fail(new Error('Native bridge protocol buffer exceeded')); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) { const line=buffer.slice(0,newline).replace(/\r$/,''); buffer=buffer.slice(newline+1); this.receive(line); }
    });
    // Drain SDK diagnostic output; do not log image data or uncontrolled vendor strings.
    this.child.stderr.resume();
    this.child.on('error',error=>this.fail(error));
    this.child.on('close',()=>this.resolveExit());
    this.child.on('exit',(code,signal)=> { if(!this.closing || this.pending) this.fail(new Error(`Native bridge exited (${code ?? signal}); camera state must be reconciled`)); });
    this.child.stdin.on('error',error=>this.fail(error));
  }
  private receive(line: string) {
    const [id,kind,...rest] = line.split('\t'); const payload=rest.join('\t');
    if(id==='0' && kind==='FRAME') {
      if(payload.length > 6*1024*1024) return;
      const jpeg=Buffer.from(payload,'base64');
      if(jpeg[0]===255 && jpeg[1]===216 && jpeg.length<4*1024*1024) this.emit('frame',jpeg);
      return;
    }
    if(id==='0' && kind==='PREVIEW_ERROR') { this.emit('previewError','Nikon Live View interrupted'); return; }
    if(!this.pending || this.pending.id!==id || !['OK','ERROR'].includes(kind)) return;
    const pending=this.pending; clearTimeout(pending.timer); this.pending=undefined;
    try { const value: unknown=JSON.parse(payload); if(kind==='ERROR') pending.reject(new Error(typeof value==='string'?value:'Native SDK command failed')); else pending.resolve(value); }
    catch { pending.reject(new Error('Invalid native SDK response')); this.fail(new Error('Invalid native SDK response')); }
  }
  private fail(error: Error) {
    if(this.fault) return; this.fault=error;
    if(this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending=undefined; }
    this.child.kill(); this.emit('fault',error);
  }
  request<T = unknown>(command: BridgeCommand, argument = ''): Promise<T> {
    if(this.fault) return Promise.reject(this.fault);
    if(this.pending) return Promise.reject(new Error('Overlapping native SDK command rejected'));
    if(/[\r\n\t]/.test(argument)) return Promise.reject(new Error('Invalid bridge argument'));
    const id=String(++this.sequence);
    return new Promise<T>((resolve,reject)=> {
      const timer=setTimeout(()=>this.fail(new Error(`${command} timed out; shutter outcome may be uncertain. No retry.`)),command==='CAPTURE'?Math.max(this.timeoutMs,35_000):this.timeoutMs);
      this.pending={ id, resolve: value=>resolve(value as T), reject, timer };
      this.child.stdin.write(`${id}\t${command}\t${argument}\n`);
    });
  }
  async close() {
    if(this.pending) this.fail(new Error('Shutdown requested during an outstanding camera command'));
    let failure:unknown;
    if(!this.fault && !this.closing) { try { await this.request('CLOSE'); } catch(error) { failure=error; } }
    this.closing=true; this.child.stdin.end(); this.child.kill();
    await new Promise<void>((resolve,reject)=> {
      const timer=setTimeout(()=>reject(new Error('Native process has not exited; transfer cleanup is unsafe')),5000);
      void this.exited.then(()=>{clearTimeout(timer);resolve();});
    });
    if(failure) throw failure;
  }
}
