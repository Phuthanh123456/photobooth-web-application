import type {SessionEngine} from './engine.js';

/** Await an existing reset/capture before releasing the SDK, even if cancellation fails. */
export async function settleCameraForShutdown(
  engine:Pick<SessionEngine,'snapshot'|'cancel'|'settled'>,
  closeCamera:()=>Promise<void>,
  report:(error:unknown)=>void=()=>{},
) {
  const state=engine.snapshot();
  if(state.busy && !['CANCELLED','ERROR','RESETTING'].includes(state.status)) {
    try {engine.cancel();} catch(error) {report(error);}
  }
  try {await engine.settled();}
  finally {await closeCamera();}
}
