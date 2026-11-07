import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MockCameraAdapter, type NikonCameraAdapter } from './camera.js';
import { createRealAdapter, fingerprints } from './nikon/setup.js';
import type { RealNikonCameraAdapter } from './nikon/adapter.js';
import { verifyJpeg } from './composition.js';

export async function loadHardwareValidation(file:string,camera:RealNikonCameraAdapter,expected:Record<string,string>) {
  const report=JSON.parse(await readFile(file,'utf8'));
  if(report.test!=='single-photo' || report.status!=='PASSED' || report.mode!=='REAL_NIKON' || report.shutterCount!==1 || !report.device || report.original!=='original.jpg') throw new Error('A passed real single-photo hardware report is required');
  if(!report.fingerprints || Object.keys(report.fingerprints).length!==Object.keys(expected).length || Object.entries(expected).some(([key,value])=>report.fingerprints[key]!==value)) throw new Error('SDK, profiles or bridge changed since hardware validation');
  const original=await readFile(path.join(path.dirname(file),'original.jpg'));
  const dimensions=await verifyJpeg(original);
  if(createHash('sha256').update(original).digest('hex')!==report.sha256 || dimensions.width!==report.width || dimensions.height!==report.height) throw new Error('Hardware test original is missing or changed');
  camera.authorizeValidatedSession(report.device);
}
class UnavailableNikonAdapter implements NikonCameraAdapter {
  readonly kind='nikon'; readonly canStartSession=false;
  constructor(readonly status:string) {}
  assertSessionAllowed():never {throw new Error(this.status);}
  async waitUntilReady():Promise<never> {throw new Error(this.status);}
  async capture():Promise<never> {throw new Error(this.status);}
}
export async function createCamera(storageRoot:string,mode=process.env.CAMERA_MODE ?? 'MOCK',realFactory=createRealAdapter):Promise<NikonCameraAdapter> {
  if(mode==='MOCK') return new MockCameraAdapter();
  if(mode!=='REAL_NIKON') throw new Error('CAMERA_MODE must be MOCK or REAL_NIKON; refusing an implicit fallback');
  let camera:RealNikonCameraAdapter;
  try { camera=await realFactory(storageRoot); }
  catch(error) {return new UnavailableNikonAdapter(`REAL_NIKON unavailable: ${String(error)}`);}
  try {
    await camera.initialize();
    if(process.env.NIKON_VALIDATION_FILE) {
      try { await loadHardwareValidation(path.resolve(process.env.NIKON_VALIDATION_FILE),camera,await fingerprints()); }
      catch(error) {camera.setValidationIssue(String(error));}
    }
    // Preview is independent of shutter permission; unsupported preview does not fake a frame.
    try { await camera.startLiveView(); } catch(error) {camera.previewStatus=String(error);}
  } catch { /* The real adapter latches its actual initialization error. Never replace it with mock. */ }
  return camera;
}
