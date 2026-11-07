import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeNikonBridge } from '../src/nikon/bridge.js';
vi.mock('node:child_process',()=>({spawn:vi.fn()}));
afterEach(()=>vi.useRealTimers());
function setup(timeout=1000) {
  const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>true)}) as unknown as ChildProcessWithoutNullStreams;
  vi.mocked(child.kill).mockImplementation(()=>{child.emit('close',0,null);return true;});
  vi.mocked(spawn).mockReturnValue(child);
  return {child,bridge:new NativeNikonBridge('fake-executable','fake-external-sdk',timeout)};
}
it('correlates SDK replies and rejects simultaneous native operations',async()=> {
  const {child,bridge}=setup();
  const first=bridge.request('READY');await expect(bridge.request('CAPTURE')).rejects.toThrow('Overlapping');
  child.stdout.emit('data','1\tOK\t{}\n');expect(await first).toEqual({});
  const close=bridge.close();child.stdout.emit('data','2\tOK\t{}\n');await close;
});
it('kills and latches a timed-out shutter without replaying or accepting a late reply',async()=> {
  vi.useFakeTimers();const {child,bridge}=setup();
  const pending=bridge.request('CAPTURE');const rejection=expect(pending).rejects.toThrow('uncertain');
  await vi.advanceTimersByTimeAsync(35000);await rejection;expect(child.kill).toHaveBeenCalledOnce();
  child.stdout.emit('data','1\tOK\t{"path":"late.jpg"}\n');
  await expect(bridge.request('READY')).rejects.toThrow('timed out');await bridge.close();
});
it('forwards bounded frame events and surfaces process crashes',async()=> {
  const {child,bridge}=setup();const frames=vi.fn();bridge.on('frame',frames);
  child.stdout.emit('data',`0\tFRAME\t${Buffer.from([255,216,255,217]).toString('base64')}\n`);expect(frames).toHaveBeenCalledOnce();
  const pending=bridge.request('READY');const failure=expect(pending).rejects.toThrow('exited');child.emit('exit',1,null);await failure;await bridge.close();
});
