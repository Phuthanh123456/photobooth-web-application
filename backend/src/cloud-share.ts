import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {SessionState} from '@photobooth/shared';
import {FileSessionStorage,validSessionId,validShareToken} from './storage.js';
import {shareOrigin} from './sharing.js';

export interface CloudConfig { projectUrl:string; anonKey:string; email:string; password:string; bucket:string; guestOrigin:string }
export interface PhotoCloud {
  namespace?:string;
  publish(token:string,jpeg:Buffer):Promise<string>;
  remove(token:string,publishedUrl?:string):Promise<void>;
}
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
export function validateCloudConfig(config:CloudConfig):CloudConfig {
  const url=new URL(config.projectUrl);
  if(url.protocol!=='https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.pathname!=='/' || url.search || url.hash || url.username || url.password) throw new Error('Use the Supabase project HTTPS origin');
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(config.bucket) || !config.anonKey || !config.email || !config.password) throw new Error('Cloud bucket and dedicated uploader credentials are required');
  let role:string|undefined;
  try {role=JSON.parse(Buffer.from(config.anonKey.split('.')[1] ?? '','base64url').toString()).role;} catch { /* new publishable keys are not JWTs */ }
  if(config.anonKey.startsWith('sb_secret_') || role==='service_role') throw new Error('Never put a service-role/secret key on an organizer laptop; use the publishable/anon key');
  const guestOrigin=shareOrigin(config.guestOrigin);
  if(!guestOrigin || !guestOrigin.startsWith('https://')) throw new Error('Deploy the guest static site to HTTPS first');
  return {...config,projectUrl:url.origin,guestOrigin};
}

/** A dedicated authenticated user with bucket policies, never a service-role key. */
export class SupabasePhotoCloud implements PhotoCloud {
  private config:CloudConfig;
  readonly namespace:string;
  private auth?:{token:string;uid:string;expires:number};
  constructor(config:CloudConfig,private request:typeof fetch=fetch) {
    this.config=validateCloudConfig(config);
    this.namespace=digest(Buffer.from(JSON.stringify([this.config.projectUrl,this.config.bucket,this.config.email.trim().toLowerCase()])));
  }
  private async headers() {
    if(!this.auth || this.auth.expires<Date.now()+60_000) {
      const response=await this.request(`${this.config.projectUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:this.config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:this.config.email,password:this.config.password}),signal:AbortSignal.timeout(15_000)});
      if(!response.ok) throw new Error(`Cloud sign-in failed (${response.status}); check the uploader account`);
      const data=await response.json();
      if(typeof data.access_token!=='string' || !/^[a-f0-9-]{36}$/i.test(data.user?.id ?? '') || !Number.isFinite(data.expires_in)) throw new Error('Invalid cloud sign-in response');
      this.auth={token:data.access_token,uid:data.user.id,expires:Date.now()+data.expires_in*1000};
    }
    return {apikey:this.config.anonKey,Authorization:`Bearer ${this.auth.token}`};
  }
  private object(token:string) {
    if(!validShareToken(token) || !this.auth) throw new Error('Invalid cloud photo identifier');
    return `${this.auth.uid}/${token}.jpg`;
  }
  async publish(token:string,jpeg:Buffer) {
    const headers=await this.headers(),object=this.object(token);
    const upload=await this.request(`${this.config.projectUrl}/storage/v1/object/${this.config.bucket}/${object}`,{method:'POST',headers:{...headers,'Content-Type':'image/jpeg','x-upsert':'true','Cache-Control':'max-age=0'},body:new Uint8Array(jpeg),signal:AbortSignal.timeout(45_000)});
    if(!upload.ok) throw new Error(`Cloud upload failed (${upload.status}); local photo is preserved`);
    const remote=await this.request(`${this.config.projectUrl}/storage/v1/object/public/${this.config.bucket}/${object}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45_000)});
    if(!remote.ok) throw new Error('Cloud photo read-back failed; QR is not ready');
    const bytes=Buffer.from(await remote.arrayBuffer());
    if(bytes.length!==jpeg.length || digest(bytes)!==digest(jpeg)) throw new Error('Cloud photo verification failed; QR is not ready');
    const ref=new URL(this.config.projectUrl).hostname.split('.')[0];
    return `${this.config.guestOrigin}/#${ref}/${this.config.bucket}/${object}`;
  }
  async remove(token:string,publishedUrl?:string) {
    const headers=await this.headers();
    if(publishedUrl) {
      const expected=`#${new URL(this.config.projectUrl).hostname.split('.')[0]}/${this.config.bucket}/${this.object(token)}`;
      if(new URL(publishedUrl).hash!==expected) throw new Error('Use the original uploader account/project to revoke this cloud photo');
    }
    const response=await this.request(`${this.config.projectUrl}/storage/v1/object/${this.config.bucket}`,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[this.object(token)]}),signal:AbortSignal.timeout(20_000)});
    if(!response.ok) throw new Error(`Cloud deletion failed (${response.status}); connect to the Internet and retry reset`);
  }
}

interface Job {sessionId:string;token:string;status:'pending'|'ready'|'deleting'|'revoked';url?:string;namespace?:string}
/** This durable queue only transfers final JPGs. It never owns or retries shutters. */
export class CloudShares extends EventEmitter {
  private jobs=new Map<string,Job>();
  private work:Promise<void>=Promise.resolve();
  private scheduled=new Set<string>();
  private revoking=new Set<string>();
  private timer?:ReturnType<typeof setInterval>;
  private errors=new Map<string,string>();
  private closed=false;
  constructor(private storage:FileSessionStorage,private cloud:PhotoCloud) {super();}
  private directory() {return path.join(this.storage.root,'cloud-jobs');}
  private async persist(job:Job) {
    await mkdir(this.directory(),{recursive:true});
    const target=path.join(this.directory(),`${job.token}.json`);
    await writeFile(`${target}.tmp`,JSON.stringify(job,null,2));await rename(`${target}.tmp`,target);
  }
  async start(intervalMs=15_000) {
    for(const name of await readdir(this.directory()).catch(error=>{if(error.code==='ENOENT') return [];throw error;})) {
      if(!/^[A-Za-z0-9_-]{32}\.json$/.test(name)) continue;
      const job:Job=JSON.parse(await readFile(path.join(this.directory(),name),'utf8'));
      if(!validSessionId(job.sessionId) || !validShareToken(job.token) || name!==`${job.token}.json` || !['pending','ready','deleting','revoked'].includes(job.status)) throw new Error('Invalid persisted cloud job');
      if(job.namespace!==this.cloud.namespace) throw new Error('Cloud project/uploader changed. Keep the original configuration to manage existing queued photos.');
      if(job.status==='ready' && (!job.url || new URL(job.url).protocol!=='https:')) throw new Error('Invalid cloud photo URL');
      this.jobs.set(job.token,job);
    }
    this.retry();this.timer=setInterval(()=>this.retry(),intervalMs);this.timer.unref();
  }
  observe(state:SessionState) {
    if(this.closed || state.status!=='COMPLETE' || state.busy || !state.sessionId) return;
    const token=state.output?.sharePath?.split('/').at(-1);
    if(!token || !validShareToken(token) || this.jobs.has(token)) return;
    const job:Job={sessionId:state.sessionId,token,status:'pending',namespace:this.cloud.namespace};this.jobs.set(token,job);this.enqueue(job);
  }
  private enqueue(job:Job) {
    if(this.closed || this.scheduled.has(job.token) || this.revoking.has(job.token)) return;
    this.scheduled.add(job.token);
    this.work=this.work.then(async()=> {
      try {
        await this.persist(job);
        if(this.closed) return; // persist queued work for next launch instead of uploading the entire backlog during stop
        if(job.status==='deleting') {await this.cloud.remove(job.token,job.url);job.status='revoked';job.url=undefined;await this.persist(job);}
        else if(job.status==='pending') {
          const {sessionId,jpeg}=await this.storage.readSharedJpeg(job.token);
          if(sessionId!==job.sessionId) throw new Error('Cloud photo session mismatch');
          const url=await this.cloud.publish(job.token,jpeg);
          // A reset may have requested deletion while upload was in flight.
          if((job.status as string)==='deleting') {await this.cloud.remove(job.token,url);job.status='revoked';job.url=undefined;}
          else {job.status='ready';job.url=url;}
          await this.persist(job);
        }
        this.errors.delete(job.token);
      } catch(error) {this.errors.set(job.token,error instanceof Error ? error.message : String(error));}
      finally {this.scheduled.delete(job.token);this.emit('change');}
    });
  }
  retry() {for(const job of this.jobs.values()) if(['pending','deleting'].includes(job.status)) this.enqueue(job);}
  info(state:SessionState):SessionState['share'] {
    const token=state.output?.sharePath?.split('/').at(-1),job=token ? this.jobs.get(token) : undefined;
    if(state.status!=='COMPLETE' || !job || job.status!=='ready' || !job.url) return undefined;
    return {url:job.url,qrImagePath:`/s/${job.token}/qr.svg`};
  }
  status(state:SessionState):SessionState['cloudUpload'] {
    if(state.status!=='COMPLETE') return undefined;
    const token=state.output?.sharePath?.split('/').at(-1),job=token ? this.jobs.get(token) : undefined;
    return {status:job?.status==='ready' ? 'ready' : this.errors.has(token ?? '') ? 'waiting' : 'uploading'};
  }
  qrUrl(token:string) {const job=this.jobs.get(token);return job?.status==='ready' ? job.url : undefined;}
  async revoke(id:string,token:string) {
    const job=this.jobs.get(token);if(!job || job.status==='revoked') return;
    if(job.sessionId!==id) throw new Error('Refusing to delete another cloud photo');
    this.revoking.add(token);
    job.status='deleting';
    try {
      await this.work; // drain an upload before attempting deletion; no concurrent writes to its job
      if((job.status as string)!=='revoked') {
        await this.persist(job);await this.cloud.remove(token,job.url);job.status='revoked';job.url=undefined;await this.persist(job);
      }
    } finally {this.revoking.delete(token);this.emit('change');}
  }
  async settled() {await this.work;}
  async close() {this.closed=true;clearInterval(this.timer);await this.work;}
}
