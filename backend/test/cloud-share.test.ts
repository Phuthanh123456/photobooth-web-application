import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {SessionState} from '@photobooth/shared';
import {CloudShares,SupabasePhotoCloud,validateCloudConfig,type PhotoCloud} from '../src/cloud-share.js';
import {FileSessionStorage} from '../src/storage.js';

const id='ab8f31f0-7ce1-4c64-a41e-7476ad369b4e',token='A'.repeat(32),uid='1534f310-bdc0-4f97-8f25-3729d3030980';
const url=`https://photos.example.edu/#example/cap-photos/${uid}/${token}.jpg`;
const config={projectUrl:'https://example.supabase.co',anonKey:'public-test-key',email:'uploader@example.edu',password:'test-password',bucket:'cap-photos',guestOrigin:'https://photos.example.edu'};
const state:SessionState={sessionId:id,status:'COMPLETE',photo:4,camera:'mock',countdownDeadlineMs:null,remainingSeconds:0,serverNowMs:0,captures:[],busy:false,output:{sharePath:`/s/${token}`,jpgUrl:'',pdfUrl:'',manifestUrl:''}};
let root:string,storage:FileSessionStorage,cloud:PhotoCloud,queue:CloudShares;
const queues:CloudShares[]=[];
beforeEach(async()=> {
  root=await mkdtemp(path.join(os.tmpdir(),'cap-cloud-'));storage=new FileSessionStorage(root);
  vi.spyOn(storage,'readSharedJpeg').mockResolvedValue({sessionId:id,jpeg:Buffer.from('verified-final')});
  cloud={publish:vi.fn(async()=>url),remove:vi.fn(async()=>{})};queue=new CloudShares(storage,cloud);queues.push(queue);await queue.start();
});
afterEach(async()=>{for(const queue of queues.splice(0)) await queue.close();await rm(root,{recursive:true,force:true});});

it('uploads only settled COMPLETE, and shows QR only after verified publication',async()=> {
  queue.observe({...state,status:'SAVING'});queue.observe({...state,busy:true});await queue.settled();expect(cloud.publish).not.toHaveBeenCalled();
  queue.observe(state);expect(queue.info(state)).toBeUndefined();await queue.settled();
  expect(cloud.publish).toHaveBeenCalledWith(token,Buffer.from('verified-final'));
  expect(queue.info(state)).toEqual({url,qrImagePath:`/s/${token}/qr.svg`});expect(queue.info({...state,status:'COUNTDOWN'})).toBeUndefined();
  queue.observe(state);await queue.settled();expect(cloud.publish).toHaveBeenCalledTimes(1);
});
it('persists an offline job, retries after restart, and retains earlier links',async()=> {
  vi.mocked(cloud.publish).mockRejectedValueOnce(new Error('offline'));
  queue.observe(state);await queue.settled();expect(queue.status(state)?.status).toBe('waiting');expect(queue.info(state)).toBeUndefined();
  await queue.close();const restarted=new CloudShares(storage,cloud);queues.push(restarted);await restarted.start();await restarted.settled();
  expect(restarted.info(state)?.url).toBe(url);expect(cloud.publish).toHaveBeenCalledTimes(2);
  expect(JSON.parse(await readFile(path.join(root,'cloud-jobs',`${token}.json`),'utf8')).status).toBe('ready');
  await restarted.close();const again=new CloudShares(storage,cloud);queues.push(again);await again.start();await again.settled();
  expect(again.info(state)?.url).toBe(url);expect(cloud.publish).toHaveBeenCalledTimes(2);
});
it('rejects corrupt/incomplete local output without ever uploading it',async()=> {
  vi.mocked(storage.readSharedJpeg).mockRejectedValue(new Error('Final JPEG verification failed'));
  queue.observe(state);await queue.settled();expect(cloud.publish).not.toHaveBeenCalled();expect(queue.status(state)?.status).toBe('waiting');
});
it('serializes uploads and revokes a photo reset during an in-flight upload',async()=> {
  let finish!:(url:string)=>void;
  vi.mocked(cloud.publish).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  queue.observe(state);await vi.waitFor(()=>expect(cloud.publish).toHaveBeenCalledTimes(1));
  const revoking=queue.revoke(id,token);queue.retry();finish(url);await revoking;await queue.settled();
  expect(queue.info(state)).toBeUndefined();expect(cloud.remove).toHaveBeenCalledWith(token,url);queue.retry();await queue.settled();expect(cloud.publish).toHaveBeenCalledTimes(1);
});
it('keeps deletion pending when offline and completes it after a restart',async()=> {
  queue.observe(state);await queue.settled();vi.mocked(cloud.remove).mockRejectedValueOnce(new Error('offline'));
  await expect(queue.revoke(id,token)).rejects.toThrow('offline');expect(queue.info(state)).toBeUndefined();await queue.close();
  const restarted=new CloudShares(storage,cloud);queues.push(restarted);await restarted.start();await restarted.settled();
  expect(cloud.remove).toHaveBeenCalledTimes(2);expect(restarted.qrUrl(token)).toBeUndefined();
});
it('does not revoke another session cloud grant',async()=> {
  queue.observe(state);await queue.settled();await expect(queue.revoke('wrong',token)).rejects.toThrow('another');expect(cloud.remove).not.toHaveBeenCalled();
});
it('refuses to silently switch uploader identity for a persisted queue',async()=> {
  cloud.namespace='original-account';queue.observe(state);await queue.settled();await queue.close();
  const changed=new CloudShares(storage,{...cloud,namespace:'another-account'});queues.push(changed);
  await expect(changed.start()).rejects.toThrow('uploader changed');
});
it('uses a dedicated user, idempotent JPG upload, read-back hash and a credential-free guest URL',async()=> {
  const jpeg=Buffer.from('a verified jpeg');
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({access_token:'test-session',expires_in:3600,user:{id:uid}})).mockResolvedValueOnce(Response.json({Key:'ok'})).mockResolvedValueOnce(new Response(jpeg)).mockResolvedValueOnce(Response.json([]));
  const provider=new SupabasePhotoCloud(config,request);
  expect(await provider.publish(token,jpeg)).toBe(url);
  expect(request.mock.calls[0][0]).toContain('grant_type=password');
  const upload=request.mock.calls[1];expect(upload[0]).toContain(`/cap-photos/${uid}/${token}.jpg`);expect(upload[1]?.headers).toMatchObject({'x-upsert':'true','Content-Type':'image/jpeg'});
  expect(String(upload[1]?.body)).not.toContain('test-password');await provider.remove(token);
  expect(request.mock.calls[3][1]?.method).toBe('DELETE');expect(request).toHaveBeenCalledTimes(4);
});
it('never publishes a QR for a cloud JPEG with different bytes',async()=> {
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({access_token:'session',expires_in:3600,user:{id:uid}})).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(new Response('corrupted'));
  await expect(new SupabasePhotoCloud(config,request).publish(token,Buffer.from('original'))).rejects.toThrow('verification failed');
});
it('does not leak sign-in response bodies or credentials through errors',async()=> {
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('private error containing password',{status:401}));
  await expect(new SupabasePhotoCloud(config,request).publish(token,Buffer.from('a'))).rejects.toThrow('Cloud sign-in failed (401)');
});
it('restricts endpoints and rejects invalid cloud configuration',()=> {
  for(const projectUrl of ['http://example.supabase.co','https://evil.example','https://example.supabase.co/redirect','https://example.supabase.co?key=secret']) expect(()=>validateCloudConfig({...config,projectUrl})).toThrow();
  expect(()=>validateCloudConfig({...config,bucket:'../other'})).toThrow();expect(()=>validateCloudConfig({...config,guestOrigin:'http://localhost'})).toThrow();
  expect(()=>validateCloudConfig({...config,anonKey:'sb_secret_example'})).toThrow('service-role');
  expect(()=>validateCloudConfig({...config,anonKey:`header.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`})).toThrow('service-role');
});
