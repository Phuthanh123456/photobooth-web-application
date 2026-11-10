import {expect,it,vi} from 'vitest';
import type {SessionState} from '@photobooth/shared';
import {settleCameraForShutdown} from '../src/shutdown.js';

it('does not cancel a reset, waits for its completion, then closes the SDK',async()=>{
  let finish!:()=>void;
  const reset=new Promise<void>(resolve=>{finish=resolve;});
  const engine={snapshot:()=>({busy:true,status:'RESETTING'} as SessionState),cancel:vi.fn(()=>{throw new Error('No active session to cancel');}),settled:()=>reset};
  const close=vi.fn(async()=>{});
  const work=settleCameraForShutdown(engine,close);
  expect(engine.cancel).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  finish();await work;expect(close).toHaveBeenCalledOnce();
});
it('still settles and releases the SDK when cancellation rejects',async()=>{
  const engine={snapshot:()=>({busy:true,status:'CAPTURING'} as SessionState),cancel:vi.fn(()=>{throw new Error('Already cancelled');}),settled:vi.fn(async()=>{})};
  const close=vi.fn(async()=>{}),report=vi.fn();
  await settleCameraForShutdown(engine,close,report);
  expect(report).toHaveBeenCalledOnce();expect(engine.settled).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
});
it('releases the SDK even if a pending task rejects, without starting a capture',async()=>{
  const engine={snapshot:()=>({busy:false,status:'ERROR'} as SessionState),cancel:vi.fn(),settled:async()=>{throw new Error('Save failed');}};
  const close=vi.fn(async()=>{});
  await expect(settleCameraForShutdown(engine,close)).rejects.toThrow('Save failed');
  expect(close).toHaveBeenCalledOnce();expect(engine.cancel).not.toHaveBeenCalled();
});
