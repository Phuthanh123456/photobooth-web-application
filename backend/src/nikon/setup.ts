import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NativeNikonBridge } from './bridge.js';
import { RealNikonCameraAdapter } from './adapter.js';
const exec=promisify(execFile);
const profiles=['DC_PTP_Config.config','MaidLayer.config','RangeValue.config'];
export const workspace=fileURLToPath(new URL('../../../',import.meta.url));
export function nikonPaths() {
  if(process.platform!=='win32') throw new Error('REAL_NIKON requires Windows x64');
  if(!process.env.NIKON_SDK_ROOT) throw new Error('NIKON_SDK_ROOT must point to the external SDK installation');
  if(!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA unavailable');
  return { sdk:path.resolve(process.env.NIKON_SDK_ROOT), executable:path.resolve(process.env.NIKON_BRIDGE_PATH ?? path.join(workspace,'native/build/nikon-bridge.exe')), profileDirectory:path.join(process.env.LOCALAPPDATA,'Nikon','NXTether') };
}
const digest = async (file:string) => createHash('sha256').update(await readFile(file)).digest('hex');
export async function fingerprints() {
  const {sdk,executable,profileDirectory}=nikonPaths(); const result: Record<string,string>={ bridge:await digest(executable) };
  for(const name of ['ControlServiceLayer.dll','NkdPTP.dll','NkRoyalmile.dll','dnssd.dll']) result[name]=await digest(path.join(sdk,'Module/Win/BinaryFile',name));
  for(const name of profiles) result[name]=await digest(path.join(profileDirectory,name));
  for(const name of ['adapter.ts','bridge.ts','setup.ts','hardware-cli.ts']) result[`node:${name}`]=await digest(path.join(workspace,'backend','src','nikon',name));
  result['node:camera-factory.ts']=await digest(path.join(workspace,'backend/src/camera-factory.ts'));
  return result;
}
export async function checkProfiles(copyMissing=false) {
  const {sdk,profileDirectory}=nikonPaths();
  if(copyMissing) await mkdir(profileDirectory,{recursive:true});
  for(const name of profiles) {
    const source=path.join(sdk,'Module/Win/BinaryFile',name), target=path.join(profileDirectory,name);
    const exists=await access(target).then(()=>true,()=>false);
    if(!exists && copyMissing) await copyFile(source,target,fsConstants.COPYFILE_EXCL);
    if(!exists && !copyMissing) throw new Error(`Missing Nikon profile ${name}. Run npm run camera:setup.`);
    if(await digest(source)!==await digest(target)) throw new Error(`Installed Nikon profile ${name} differs from this SDK. Back up/reconcile it manually; automatic overwrite is refused.`);
  }
}
export async function checkCameraClientsClosed() {
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process | Where-Object { $_.ProcessName -match 'NX.?Tether|Nikon.?Transfer|Camera.?Control.?Pro|nikon-bridge' } | Select-Object -ExpandProperty ProcessName"],{windowsHide:true,timeout:10_000});
  if(stdout.trim()) throw new Error(`Close camera clients before using Nikon SDK: ${stdout.trim()}`);
}
export async function createRealAdapter(storageRoot:string) {
  await checkCameraClientsClosed(); await checkProfiles();
  const {sdk,executable}=nikonPaths();
  return new RealNikonCameraAdapter(new NativeNikonBridge(executable,sdk),path.join(storageRoot,'temp'));
}
