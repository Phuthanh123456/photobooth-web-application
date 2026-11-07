import { readFile, mkdir, rm, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CameraImage, CaptureRequest, NikonCameraAdapter } from '../camera.js';
import { verifyJpeg } from '../composition.js';
import { validSessionId } from '../storage.js';
import type { BridgePort } from './bridge.js';

export interface NikonDevice { id:number; name:string; version:string }
export interface NikonCaptureResult { path:string; totalMs:number; captureMs:number|null; transferMs:number|null }
export class RealNikonCameraAdapter implements NikonCameraAdapter {
  readonly kind='nikon';
  device?: NikonDevice;
  configuration?: { quality:string; size:string; saveMedia:number };
  diagnostics?: Omit<NikonCaptureResult,'path'>;
  latestFrame?: { bytes:Buffer; at:number };
  private fault?: Error;
  private busy=false;
  private initialized=false;
  private sessionAuthorized=false;
  private confirmedSingle=false;
  private transfers=new Map<string,{directory:string;rootReal:string}[]>();
  private validationIssue='Single-photo hardware validation required';
  previewStatus='Live View not started';
  constructor(private bridge: BridgePort, private transferRoot: string) {
    bridge.on('fault',(error: Error)=> {this.latch(error);});
    bridge.on('previewError',(message: string)=> {this.previewStatus=message;this.latestFrame=undefined;});
    bridge.on('frame',(bytes: Buffer)=> {if(this.fault) return;this.latestFrame={bytes,at:performance.now()};this.previewStatus='Live View streaming';});
  }
  get status() { return this.fault ? this.fault.message : !this.initialized ? 'Not connected' : this.sessionAuthorized ? 'Z30 ready · hardware validated' : `Connected · ${this.validationIssue}`; }
  setValidationIssue(message: string) { this.validationIssue=message; }
  get canStartSession() {return this.initialized && this.sessionAuthorized && !this.fault;}
  assertSessionAllowed() { if(!this.canStartSession) throw new Error(`REAL_NIKON locked: ${this.status}. Run the confirmed single-photo hardware test first.`); }
  private check() { if(this.fault) throw this.fault; if(!this.initialized) throw new Error('Nikon SDK not initialized'); }
  private latch(error:unknown):Error {
    this.fault=error instanceof Error?error:new Error(String(error));
    this.latestFrame=undefined;this.previewStatus=`Capture locked: ${this.fault.message}`;
    return this.fault;
  }
  async initialize() {
    if(this.initialized) return;
    try {
      const device=await this.bridge.request<NikonDevice>('INIT');
      if(!device || typeof device.id!=='number' || !/Z\s?30/i.test(device.name) || typeof device.version!=='string') throw new Error('SDK did not report a Nikon Z30');
      this.device=device;
      const configuration=await this.bridge.request<{quality:string;size:string;saveMedia:number}>('CONFIGURE');
      if(!configuration || !/fine/i.test(configuration.quality) || /raw|nef/i.test(configuration.quality) || !configuration.size || configuration.saveMedia!==2) throw new Error('JPEG Large/Fine or PC transfer configuration not verified');
      this.configuration=configuration; this.initialized=true;
    } catch(error) {throw this.latch(error);}
  }
  authorizeValidatedSession(device: NikonDevice) {
    this.check();
    if(device.id!==this.device?.id || device.name!==this.device.name || device.version!==this.device.version) throw new Error('Hardware validation belongs to a different device/firmware');
    this.sessionAuthorized=true;
  }
  confirmOneHardwareShutter() { this.check(); if(this.confirmedSingle) throw new Error('Single hardware shutter already confirmed'); this.confirmedSingle=true; }
  async waitUntilReady() {
    this.check();if(this.busy) throw new Error('Camera busy');
    const deadline=performance.now()+15000;
    while(true) {
      try {await this.bridge.request('READY');return;}
      catch(error) {
        // Only repeat an explicitly busy readiness query. Never replay CAPTURE.
        if(error instanceof Error && error.message==='Camera busy' && performance.now()<deadline) {
          await new Promise(resolve=>setTimeout(resolve,100));this.check();continue;
        }
        throw this.latch(error);
      }
    }
  }
  async capture({sessionId,photo}: CaptureRequest): Promise<CameraImage> {
    this.check();
    if(this.busy) throw new Error('Overlapping Nikon shutter rejected');
    if(!validSessionId(sessionId) || ![1,2,3,4].includes(photo)) throw new Error('Invalid capture correlation');
    if(!this.sessionAuthorized && !this.confirmedSingle) throw new Error('Real shutter requires operator confirmation and hardware validation');
    this.confirmedSingle=false; this.busy=true;
    const directory=path.resolve(this.transferRoot,`bridge-${sessionId}-${photo}-${randomUUID()}`);
    try {
      await mkdir(directory,{recursive:true});
      this.transfers.set(sessionId,[...(this.transfers.get(sessionId) ?? []),{directory,rootReal:await realpath(this.transferRoot)}]);
      const result=await this.bridge.request<NikonCaptureResult>('CAPTURE',Buffer.from(directory,'utf8').toString('base64'));
      if(!result || typeof result.path!=='string' || path.dirname(path.resolve(result.path))!==directory || !/\.jpe?g$/i.test(result.path)) throw new Error('SDK transfer path is outside this capture directory');
      if((await lstat(result.path)).isSymbolicLink()) throw new Error('SDK capture file must not be a symbolic link');
      const bytes=await readFile(result.path); await verifyJpeg(bytes);
      this.diagnostics={ totalMs:result.totalMs, captureMs:result.captureMs, transferMs:result.transferMs };
      // Validated, settled transfer only. An uncertain transfer is retained for operator inspection.
      await rm(directory,{recursive:true,force:true});
      this.transfers.set(sessionId,(this.transfers.get(sessionId) ?? []).filter(entry=>entry.directory!==directory));
      return {bytes,extension:'jpg'};
    } catch(error) {throw this.latch(error);}
    finally {this.busy=false;}
  }
  async startLiveView() {this.check();await this.bridge.request('LIVE_START');this.previewStatus='Waiting for Nikon Live View frames';}
  async cleanupSession(sessionId:string) {
    if(!validSessionId(sessionId) || this.busy) throw new Error('Transfer cleanup requires a valid, settled session');
    const entries=this.transfers.get(sessionId) ?? [];
    if(!entries.length) return;
    // Explicit reset may discard a failed transfer only after the SDK process has released it.
    if(this.fault) await this.bridge.close();
    for(const {directory,rootReal} of entries) {
      if(await realpath(this.transferRoot)!==rootReal || path.dirname(directory)!==path.resolve(this.transferRoot)) throw new Error('Transfer directory boundary changed');
      const stat=await lstat(directory).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(!stat) continue;
      if(stat.isSymbolicLink() || path.dirname(await realpath(directory))!==rootReal) throw new Error('Refusing redirected transfer cleanup');
      await rm(directory,{recursive:true,force:true});
    }
    this.transfers.delete(sessionId);
  }
  async stopLiveView() {this.check();await this.bridge.request('LIVE_STOP');this.latestFrame=undefined;this.previewStatus='Live View stopped';}
  async close() {await this.bridge.close();this.initialized=false;this.latestFrame=undefined;}
}
