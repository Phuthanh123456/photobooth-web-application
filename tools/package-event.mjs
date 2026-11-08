import {cp,mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(process.platform!=='win32' || process.arch!=='x64') throw new Error('Build the Windows x64 handoff on Windows x64.');
const root=fileURLToPath(new URL('../',import.meta.url));
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const destination=path.join(root,'.local/releases',`CAP-Photobooth-Windows-${stamp}`);
async function run(file,args,cwd=root) {
  await new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0 ? resolve() : reject(new Error(`Build command failed (${code})`)));});
}
await run('cmd.exe',['/d','/s','/c','npm run build']);
await mkdir(destination,{recursive:true});
// Explicit allowlist: never copy .local, private storage, reports, SDK or developer configuration.
const entries=['package.json','package-lock.json','backend/package.json','backend/src','shared/package.json','shared/src','frontend/package.json','frontend/dist','assets/templates','cloud','render.yaml','HANDOFF_VI.md',
  'Start Photobooth.cmd','Stop Photobooth.cmd','Test Mock.cmd','Setup Camera.cmd','Allow iPad Network.cmd','Configure Cloud.cmd',
  'tools/event-runner.mjs','tools/event-gateway.mjs','tools/setup-event-camera.ps1','tools/event-firewall.ps1','tools/save-jpg-dialog.ps1','tools/start-share-tunnel.ps1','tools/stop-share-tunnel.ps1','tools/cloud-config.example.json','tools/configure-cloud.ps1','tools/check-cloud.mjs'];
for(const entry of entries) {const target=path.join(destination,entry);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(root,entry),target,{recursive:true});}
await mkdir(path.join(destination,'runtime'),{recursive:true});
await cp(process.execPath,path.join(destination,'runtime/node.exe'));
const nodeLicense=await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);
if(!nodeLicense.ok) throw new Error('Could not retrieve license for the bundled Node version');
await writeFile(path.join(destination,'runtime/NODE-LICENSE.txt'),await nodeLicense.text());
// This is our compiled bridge, not Nikon's SDK runtime. Recipient installs the licensed SDK separately.
await mkdir(path.join(destination,'native/build'),{recursive:true});
await cp(path.join(root,'native/build/nikon-bridge.exe'),path.join(destination,'native/build/nikon-bridge.exe'));
const release=JSON.parse(await readFile(path.join(root,'.local/bin/cloudflared-release.json'),'utf8'));
const cloudflared=await readFile(path.join(root,'.local/bin/cloudflared.exe'));
if(createHash('sha256').update(cloudflared).digest('hex')!==release.sha256) throw new Error('cloudflared checksum failed; run share:install first.');
await mkdir(path.join(destination,'.local/bin'),{recursive:true});
await writeFile(path.join(destination,'.local/bin/cloudflared.exe'),cloudflared);
await writeFile(path.join(destination,'.local/bin/cloudflared-release.json'),JSON.stringify(release,null,2));
const tunnelLicense=await fetch(`https://raw.githubusercontent.com/cloudflare/cloudflared/${release.version}/LICENSE`);
if(!tunnelLicense.ok) throw new Error('Could not retrieve bundled cloudflared license');
await writeFile(path.join(destination,'.local/bin/CLOUDFLARED-LICENSE.txt'),await tunnelLicense.text());
await writeFile(path.join(destination,'THIRD-PARTY-NOTICES.txt'),'Node.js license: runtime/NODE-LICENSE.txt\ncloudflared (Apache-2.0): https://github.com/cloudflare/cloudflared/blob/master/LICENSE\nRuntime npm dependency licenses are retained inside node_modules.\nNikon SDK is NOT included. Obtain/install the compatible licensed SDK separately.\n');
await run('cmd.exe',['/d','/s','/c','npm ci --omit=dev --no-audit --no-fund'],destination);
const files=[];
async function inventory(directory,relative='') {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const name=path.join(relative,entry.name),file=path.join(directory,entry.name);
    if(entry.isSymbolicLink()) continue; // npm workspace links only point to allowlisted local packages
    if(entry.isDirectory()) {await inventory(file,name);continue;}
    if(/^(ControlServiceLayer|NkdPTP|NkRoyalmile|dnssd)\.dll$/i.test(entry.name) || /^(event-config|cloud-config|result)\.json$/.test(entry.name) || name.startsWith('storage'+path.sep) || entry.name==='.env') throw new Error(`Private/proprietary file in release: ${name}`);
    files.push({file:name.replaceAll('\\','/'),bytes:(await stat(file)).size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
  }
}
await inventory(destination);
await writeFile(path.join(destination,'RELEASE-MANIFEST.json'),JSON.stringify({schemaVersion:1,node:process.version,createdAt:new Date().toISOString(),files},null,2));
const zip=`${destination}.zip`;
// Fixed script, paths are separate process arguments; no shell interpolation of filenames.
const zipScript=path.join(root,'tools/zip-release.ps1');
await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',zipScript,'-Source',destination,'-Destination',zip]);
console.log(`\nPortable handoff: ${zip}\nExtract before running. SDK and per-camera validation are intentionally not included.`);
