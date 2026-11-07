import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { checkProfiles, createRealAdapter, fingerprints, workspace } from './setup.js';
import { verifyJpeg } from '../composition.js';
import type { RealNikonCameraAdapter } from './adapter.js';

const mode=process.argv[2];
if(mode==='--setup') { await checkProfiles(true); console.log('Nikon profiles verified; existing files were not overwritten.'); }
else if(mode==='--probe' || mode==='--capture') {
  const root=path.resolve(process.env.STORAGE_ROOT ?? path.join(workspace,'storage'));
  const id=randomUUID(), directory=path.join(root,'hardware-test',id);
  await mkdir(directory,{recursive:true});
  let camera: RealNikonCameraAdapter | undefined;
  let result: Record<string,unknown>={ schemaVersion:1, test:mode==='--probe'?'probe':'single-photo', status:'NOT_TESTED', mode:'REAL_NIKON', timestamp:new Date().toISOString(), shutterCount:0 };
  try {
    camera=await createRealAdapter(root); await camera.initialize(); await camera.waitUntilReady();
    result={...result,device:camera.device,configuration:camera.configuration,fingerprints:await fingerprints()};
    console.log(JSON.stringify({device:camera.device,configuration:camera.configuration},null,2));
    if(mode==='--probe') { result.status='PROBE_ONLY'; console.log('Probe finished. No shutter command was issued.'); }
    else {
      if(!process.stdin.isTTY) throw new Error('Hardware capture requires an interactive operator terminal; no --yes bypass is provided.');
      const prompt=createInterface({input:process.stdin,output:process.stdout});
      const answer=await prompt.question('Confirm the scene is ready. Type CAPTURE ONE REAL PHOTO to trigger exactly one shutter: '); prompt.close();
      if(answer!=='CAPTURE ONE REAL PHOTO') throw new Error('Operator did not confirm a real shutter');
      camera.confirmOneHardwareShutter();
      result.shutterCount=1; result.status='SHUTTER_REQUESTED';
      await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));
      const image=await camera.capture({sessionId:id,photo:1});
      const original=path.join(directory,'original.jpg'); await writeFile(`${original}.tmp`,image.bytes); await rename(`${original}.tmp`,original);
      const saved=await readFile(original), dimensions=await verifyJpeg(saved);
      const sha256=createHash('sha256').update(saved).digest('hex');
      if(sha256!==createHash('sha256').update(image.bytes).digest('hex')) throw new Error('Original JPEG read-back hash mismatch');
      await camera.waitUntilReady();
      result={...result,status:'PASSED',original:'original.jpg',bytes:saved.length,sha256,...dimensions,latency:camera.diagnostics};
      console.log(`Single-photo capture verified (${dimensions.width}×${dimensions.height}).`,camera.diagnostics);
    }
  } catch(error) { result={...result,device:camera?.device,configuration:camera?.configuration,status:'FAILED',error:String(error)}; console.error(String(error)); process.exitCode=1; }
  finally {
    try { await camera?.close(); }
    catch(error) {result={...result,status:'FAILED',error:`Resource release failed: ${String(error)}`};process.exitCode=1;}
    await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));
    console.log('Hardware result:',path.join(directory,'result.json'));
  }
} else { console.error('Use --setup, --probe (no shutter), or --capture (interactive confirmation required).'); process.exitCode=2; }
