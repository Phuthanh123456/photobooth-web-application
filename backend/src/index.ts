import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCamera } from './camera-factory.js';
import { FileSessionStorage } from './storage.js';
import { SessionEngine } from './engine.js';
import { createPhotoboothServer } from './server.js';
import { DesktopSave, windowsSaveDialog } from './desktop-save.js';
import {readFile} from 'node:fs/promises';
import {createPublicShareServer,shareOrigin} from './sharing.js';
import {CloudShares,SupabasePhotoCloud} from './cloud-share.js';
import {settleCameraForShutdown} from './shutdown.js';
const root = process.env.STORAGE_ROOT ? path.resolve(process.env.STORAGE_ROOT) : path.resolve(fileURLToPath(new URL('../../storage', import.meta.url)));
const storage = new FileSessionStorage(root, Number(process.env.TEMPLATE_PAGE ?? 1));
const cloudProvider=process.env.CLOUD_CONFIG_FILE ? new SupabasePhotoCloud(JSON.parse((await readFile(process.env.CLOUD_CONFIG_FILE,'utf8')).replace(/^\uFEFF/,''))) : undefined;
const cloud=cloudProvider ? new CloudShares(storage,cloudProvider) : undefined;
if(cloud) {
  storage.beforeDeleteCompleted=(id,token)=>cloud.revoke(id,token);
  await cloud.start();
}
const camera = await createCamera(root);
const engine = new SessionEngine(camera, storage);
if(cloud) engine.on('state',state=>cloud.observe(state));
const desktopSave=process.env.AUTO_SAVE_DIALOG==='1' ? new DesktopSave(storage,windowsSaveDialog(root),process.env.PHOTOBOOTH_SAVE_FOLDER || storage.outputFolder) : undefined;
const offerSave=()=>desktopSave?.observe(engine.snapshot());
engine.on('state',offerSave);
const interrupted = await storage.recoverInterrupted();
if (interrupted) engine.restoreInterrupted(interrupted);
if(!interrupted && process.env.RESTORE_COMPLETED_SESSION) {
  const id=process.env.RESTORE_COMPLETED_SESSION;
  const saved=await readFile(path.join(storage.sessionDirectory(id),'manifest.json'),'utf8').catch(error=>{if(error.code==='ENOENT') return null;throw error;});
  // Starting another session normally removes older temporary originals.
  if(saved) {
    const state=JSON.parse(saved);
    if(state.status!=='COMPLETE' || state.busy) throw new Error('Only a settled COMPLETE session can be restored for display');
    await storage.verify(id,state.captures);
    const sharePath=await storage.ensureShare(id);
    engine.restoreCompleted({...state,output:{...state.output,sharePath}});
  } else console.info('Previous completed display has been cleared; starting IDLE. Existing final photo links are preserved.');
}
const publicOrigin=shareOrigin(process.env.PUBLIC_SHARE_ORIGIN);
cloud?.observe(engine.snapshot());
const publicServer=!cloud && process.env.SHARE_PORT && publicOrigin ? createPublicShareServer(storage,publicOrigin) : undefined;
publicServer?.listen(Number(process.env.SHARE_PORT),'127.0.0.1',()=>console.log(`Public photo-only listener: 127.0.0.1:${process.env.SHARE_PORT}`));
const { server, wss } = createPhotoboothServer(engine, root, storage, camera, desktopSave,publicOrigin,cloud);
const port = Number(process.env.BACKEND_PORT ?? 3001);
server.listen(port, '127.0.0.1', () => console.log(`Photobooth backend: http://localhost:${port}; storage:`, root));
let shuttingDown=false;
async function shutdown() {
  if(shuttingDown) return;shuttingDown=true;
  try {
    await settleCameraForShutdown(engine,async()=>{
      if ('close' in camera && typeof camera.close === 'function') await camera.close();
    },error=>console.error('Session cancellation during shutdown:',String(error)));
  } catch(error) {console.error('Camera shutdown failed; inspect camera before reconnecting:',String(error));}
  finally {
    engine.off('state',offerSave);
    const closed=await Promise.allSettled([desktopSave?.close(),cloud?.close()]);
    for(const result of closed) if(result.status==='rejected') console.error('Shutdown cleanup failed:',String(result.reason));
    for (const client of wss.clients) client.terminate();
    publicServer?.close();
    server.close();
    if(process.connected) process.disconnect();
  }
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
// Only the local launcher owns this private parent/child IPC channel.
process.on('message',message=>{if(message==='shutdown') void shutdown();});
process.once('disconnect',()=>void shutdown());
