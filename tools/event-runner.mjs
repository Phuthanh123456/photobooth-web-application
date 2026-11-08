import {fork,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,unlink,access,open} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEventGateway} from './event-gateway.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const localDir=path.join(root,'.local');
const recordFile=path.join(localDir,'event-instance.json');
const configFile=path.join(localDir,'event-config.json');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const command=process.argv[2] ?? 'start';
async function load(file,fallback) {try{return JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));}catch(error){if(error.code==='ENOENT') return fallback;throw error;}}
function openBrowser(url) {if(process.env.CAP_NO_BROWSER!=='1' && process.platform==='win32') {const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}}
async function available(port) {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
  await new Promise(resolve=>server.close(resolve));
}
async function execute(file,args) {
  await new Promise((resolve,reject)=> {
    const child=spawn(file,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
    child.on('error',reject);child.on('exit',code=>code===0 ? resolve() : reject(new Error(`${path.basename(file)} exited ${code}`)));
  });
}
async function status(record) {
  try {return (await fetch(`http://127.0.0.1:${record.port}/event-control/status`,{headers:{'x-cap-stop-token':record.token},signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}
}
await mkdir(localDir,{recursive:true});
if(command==='stop') {
  const record=await load(recordFile,null);
  if(!record || !(await status(record))) {console.log('No responsive CAP event instance. No processes were killed.');process.exit(0);}
  const response=await fetch(`http://127.0.0.1:${record.port}/event-control/stop`,{method:'POST',headers:{'x-cap-stop-token':record.token},signal:AbortSignal.timeout(3000)});
  if(!response.ok) throw new Error('Safe stop was rejected');
  console.log(await response.text());
  for(let attempt=0;attempt<120;attempt++) {if(!(await status(record))) {console.log('CAP stopped.');process.exit(0);}await pause(500);}
  throw new Error('Still waiting for safe shutdown. Inspect the CAP window; no camera process was force-killed.');
}
if(!['start','mock'].includes(command)) throw new Error('Use start, mock or stop');
const previous=await load(recordFile,null);
if(previous) {
  if(await status(previous)) {console.log('CAP is already running.');openBrowser(`http://localhost:${previous.port}/operator`);process.exit(0);}
  let processAlive=false;
  try {process.kill(previous.pid,0);processAlive=true;}catch {}
  if(processAlive) throw new Error('A previous CAP launcher may still be starting. Inspect its window; no duplicate instance was started.');
  await unlink(recordFile);
}
const config=await load(configFile,{});
const mock=command==='mock';
const frontendPort=Number(config.frontendPort ?? 5180),backendPort=Number(config.backendPort ?? 3010),sharePort=Number(config.sharePort ?? 3011);
for(const port of [frontendPort,backendPort,sharePort]) {if(!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Event ports must be 1024-65535');}
if(new Set([frontendPort,backendPort,sharePort]).size!==3) throw new Error('Event ports must be different');
await available(frontendPort);await available(backendPort);await available(sharePort);
await access(path.join(root,'frontend/dist/index.html'));
if(!mock) {
  if(!config.sdkRoot || !config.validationFile) throw new Error('Run Setup Camera.cmd once on this laptop before Start Photobooth.cmd. Mock preview is available separately.');
  await access(config.sdkRoot);await access(path.resolve(root,config.validationFile));
}
const stopToken=randomBytes(32).toString('hex');
const lock=await open(recordFile,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,port:frontendPort,token:stopToken}));await lock.close();
let gateway,child,log,tunnelStarted=false,stopping=false;
async function stop() {
  if(stopping) return;stopping=true;
  console.log('Stopping CAP safely. Waiting for in-flight camera/save operations...');
  if(child && child.exitCode===null && child.connected) {
    child.send('shutdown');
    await new Promise(resolve=>child.once('exit',resolve));
  }
  await gateway?.close();
  if(tunnelStarted) await execute('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/stop-share-tunnel.ps1')]);
  await log?.close();await unlink(recordFile).catch(()=>{});
  console.log('CAP stopped. Outputs are preserved.');
}
try {
  let origin,cloudFile;
  const selectedCloud=path.join(localDir,'cloud-config.json');
  try {await access(selectedCloud);cloudFile=selectedCloud;}catch {}
  if(!cloudFile && config.sharing!=='offline') {
    if(!mock || config.sharing==='tunnel') {
      await execute('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/start-share-tunnel.ps1'),'-Port',String(sharePort)]);
      origin=(await readFile(path.join(localDir,'public-share-origin.txt'),'utf8')).trim();tunnelStarted=true;
      console.log('Temporary QR mode: keep this laptop and tunnel online. Cloud setup makes links independent of this laptop.');
    }
  }
  log=await open(path.join(localDir,'event-backend.log'),'a');
  child=fork(path.join(root,'backend/src/index.ts'),[],{cwd:root,execArgv:['--import','tsx'],windowsHide:true,stdio:['ignore',log.fd,log.fd,'ipc'],env:{...process.env,
    CAMERA_MODE:mock ? 'MOCK' : 'REAL_NIKON',STORAGE_ROOT:path.join(root,mock ? 'storage/mock-event' : 'storage'),
    BACKEND_PORT:String(backendPort),NIKON_SDK_ROOT:config.sdkRoot ?? '',NIKON_VALIDATION_FILE:mock ? '' : path.resolve(root,config.validationFile),
    AUTO_SAVE_DIALOG:mock ? '0' : '1',RESTORE_COMPLETED_SESSION:'',TEMPLATE_PAGE:'1',
    PUBLIC_SHARE_ORIGIN:origin ?? '',SHARE_PORT:origin ? String(sharePort) : '',CLOUD_CONFIG_FILE:cloudFile ?? ''}});
  child.on('error',error=>{console.error(error);void stop();});
  child.on('exit',code=>{if(!stopping) {console.error(`Backend exited (${code}). Check .local/event-backend.log.`);void stop();}});
  let health;
  for(let attempt=0;attempt<120;attempt++) {
    if(child.exitCode!==null || stopping) throw new Error('Backend stopped during startup; see .local/event-backend.log');
    try {const response=await fetch(`http://127.0.0.1:${backendPort}/health`,{signal:AbortSignal.timeout(1000)});if(response.ok) {health=await response.json();break;}}catch {}
    await pause(500);
  }
  if(!health) throw new Error('Backend startup timed out; see .local/event-backend.log');
  gateway=createEventGateway({backendPort,frontendDirectory:path.join(root,'frontend/dist'),stopToken,onStop:stop});
  await new Promise((resolve,reject)=>{gateway.server.once('error',reject);gateway.server.listen(frontendPort,'0.0.0.0',resolve);});
  console.log(`\nCAP ${mock ? 'MOCK - NO REAL SHUTTER' : 'REAL NIKON'}\nOperator: http://localhost:${frontendPort}/operator`);
  for(const entries of Object.values(networkInterfaces())) for(const ip of entries ?? []) if(ip.family==='IPv4' && !ip.internal) console.log(`iPad (same hotspot/Wi-Fi): http://${ip.address}:${frontendPort}/display`);
  console.log(health.ready ? 'Ready. Start sessions from the operator page.' : 'Camera validation/connection needs attention. Check the operator page.');
  console.log('Keep this window open. To finish, double-click Stop Photobooth.cmd or press Ctrl+C.');
  openBrowser(`http://localhost:${frontendPort}/operator`);
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
} catch(error) {await stop();throw error;}
