import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureRecord, SessionState } from '@photobooth/shared';
import { SessionEngine, type Clock } from '../src/engine.js';
import type { CameraImage, NikonCameraAdapter } from '../src/camera.js';
import type { SessionStorage } from '../src/storage.js';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
class MemoryStorage implements SessionStorage {
  manifests: SessionState[] = [];
  save = vi.fn(async (_id: string, photo: number, _image: CameraImage) => ({ file: `${photo}.svg`, bytes: 12, sha256: 'test-hash', savedAt: 'test' }));
  verify = vi.fn(async (_id: string, records: CaptureRecord[]) => { if (records.filter(r => r.status === 'saved').length !== 4) throw new Error('Missing image'); });
  async manifest(state: SessionState) { this.manifests.push(structuredClone(state)); }
}
describe('four-photo session engine', () => {
  let camera: NikonCameraAdapter;
  let storage: MemoryStorage;
  let engine: SessionEngine;
  let clock: Clock;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    clock = { now: () => performance.now(), sleep: delay };
    camera = { kind: 'mock', waitUntilReady: vi.fn(async () => {}), capture: vi.fn(async () => ({ bytes: new Uint8Array([1]), extension: 'svg' as const })) };
    storage = new MemoryStorage();
    engine = new SessionEngine(camera, storage, clock);
  });
  afterEach(() => vi.useRealTimers());
  it('captures exactly four photos and verifies all records before COMPLETE', async () => {
    engine.start();
    await vi.advanceTimersByTimeAsync(40_000);
    await engine.settled();
    const state = engine.snapshot();
    expect(state.status).toBe('COMPLETE');
    expect(camera.capture).toHaveBeenCalledTimes(4);
    expect(storage.verify).toHaveBeenCalledOnce();
    expect(state.captures.map(r => r.status)).toEqual(['saved', 'saved', 'saved', 'saved']);
    expect(state.captures.map(r => r.shutterAtMs)).toEqual([10_000, 20_000, 30_000, 40_000]);
    expect(storage.manifests.at(-1)?.busy).toBe(false);
    const id = state.sessionId;
    engine.start();
    expect(engine.snapshot().sessionId).not.toBe(id);
    engine.cancel(); await engine.settled();
  });
  it('does not issue a shutter before the full 10,000ms monotonic countdown', async () => {
    engine.start();
    await vi.advanceTimersByTimeAsync(9999);
    expect(camera.capture).not.toHaveBeenCalled();
    expect(engine.snapshot().remainingSeconds).toBe(1);
    vi.setSystemTime(new Date('2099-01-01'));
    expect(camera.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(camera.capture).toHaveBeenCalledTimes(1);
    const countdowns = storage.manifests.filter(s => s.status === 'COUNTDOWN');
    expect(countdowns.every(s => s.countdownDeadlineMs! - s.serverNowMs === 10_000)).toBe(true);
    engine.cancel(); await vi.advanceTimersByTimeAsync(50); await engine.settled();
  });
  it('rejects duplicate START synchronously and throughout a session', async () => {
    engine.start();
    expect(() => engine.start()).toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(() => engine.start()).toThrow();
    await vi.advanceTimersByTimeAsync(30_000); await engine.settled();
    expect(camera.capture).toHaveBeenCalledTimes(4);
  });
  it('latches ERROR after an uncertain capture failure and never retries', async () => {
    vi.mocked(camera.capture).mockRejectedValue(new Error('Uncertain shutter'));
    engine.start(); await vi.advanceTimersByTimeAsync(100_000); await engine.settled();
    expect(engine.snapshot().status).toBe('ERROR');
    expect(camera.capture).toHaveBeenCalledTimes(1);
    expect(() => engine.start()).toThrow();
    engine.reset(); expect(engine.snapshot().status).toBe('IDLE');
  });
  it('enters ERROR on save failure and never starts another countdown', async () => {
    storage.save.mockRejectedValue(new Error('Disk full'));
    engine.start(); await vi.advanceTimersByTimeAsync(60_000); await engine.settled();
    expect(engine.snapshot().status).toBe('ERROR');
    expect(camera.capture).toHaveBeenCalledTimes(1);
    expect(storage.verify).not.toHaveBeenCalled();
  });
  it('cancels a countdown without issuing any shutter', async () => {
    engine.start(); await vi.advanceTimersByTimeAsync(5000); engine.cancel();
    await vi.advanceTimersByTimeAsync(60_000); await engine.settled();
    expect(engine.snapshot().status).toBe('CANCELLED');
    expect(camera.capture).not.toHaveBeenCalled();
    expect(storage.manifests.at(-1)?.captures).toHaveLength(4);
  });
  it('waits for an in-flight capture to save after cancellation and blocks reuse', async () => {
    vi.mocked(camera.capture).mockImplementation(async () => { await delay(1000); return { bytes: new Uint8Array([1]), extension: 'svg' }; });
    engine.start(); await vi.advanceTimersByTimeAsync(10_000); engine.cancel();
    expect(() => engine.reset()).toThrow(); expect(() => engine.start()).toThrow();
    await vi.advanceTimersByTimeAsync(1000); await engine.settled();
    expect(storage.save).toHaveBeenCalledOnce();
    expect(engine.snapshot().status).toBe('CANCELLED');
    expect(engine.snapshot().captures[0].status).toBe('saved');
    engine.reset(); expect(engine.snapshot().status).toBe('IDLE');
  });
  it('cancels during saving without losing the exposed image or starting another shutter', async () => {
    storage.save.mockImplementation(async () => { await delay(500); return { file: '1.svg', bytes: 1, sha256: 'hash', savedAt: 'now' }; });
    engine.start(); await vi.advanceTimersByTimeAsync(10_000);
    expect(engine.snapshot().status).toBe('SAVING'); engine.cancel();
    await vi.advanceTimersByTimeAsync(60_000); await engine.settled();
    expect(camera.capture).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().captures[0].status).toBe('saved');
    expect(engine.snapshot().status).toBe('CANCELLED');
  });
  it('honors cancellation while persisting the shutter intent, before any shutter command', async () => {
    vi.spyOn(storage, 'manifest').mockImplementation(async state => {
      if (state.status === 'CAPTURING') await delay(500);
    });
    engine.start(); await vi.advanceTimersByTimeAsync(10_000);
    expect(engine.snapshot().status).toBe('CAPTURING');
    engine.cancel(); await vi.advanceTimersByTimeAsync(500); await engine.settled();
    expect(camera.capture).not.toHaveBeenCalled();
    expect(engine.snapshot().captures[0].status).toBe('pending');
    expect(engine.snapshot().status).toBe('CANCELLED');
  });
  it('has no overlapping shutters and begins the next countdown immediately after save and readiness', async () => {
    let active = 0; let maximum = 0;
    vi.mocked(camera.waitUntilReady).mockImplementation(() => delay(200));
    vi.mocked(camera.capture).mockImplementation(async () => { active++; maximum = Math.max(maximum, active); await delay(100); active--; return { bytes: new Uint8Array([1]), extension: 'svg' }; });
    storage.save.mockImplementation(async (_id, photo) => { await delay(300); return { file: `${photo}.svg`, bytes: 1, sha256: 'hash', savedAt: 'now' }; });
    engine.start(); await vi.advanceTimersByTimeAsync(10_800);
    expect(engine.snapshot().status).toBe('COUNTDOWN');
    expect(engine.snapshot().photo).toBe(2);
    expect(engine.snapshot().countdownDeadlineMs).toBe(20_800);
    await vi.advanceTimersByTimeAsync(40_000); await engine.settled();
    expect(maximum).toBe(1);
    expect(engine.snapshot().captures.map(r => r.shutterAtMs)).toEqual([10_200,20_800,31_400,42_000]);
  });
  it('never marks COMPLETE when final verification fails', async () => {
    storage.verify.mockRejectedValue(new Error('Corrupt image'));
    engine.start(); await vi.advanceTimersByTimeAsync(40_000); await engine.settled();
    expect(engine.snapshot().status).toBe('ERROR');
    expect(storage.manifests.some(s => s.status === 'COMPLETE')).toBe(false);
  });
  it('reports manifest failure without issuing a shutter', async () => {
    vi.spyOn(storage, 'manifest').mockRejectedValue(new Error('Read-only disk'));
    engine.start(); await engine.settled();
    expect(engine.snapshot().status).toBe('ERROR');
    expect(camera.capture).not.toHaveBeenCalled();
  });
  it('does not capture when readiness fails', async () => {
    vi.mocked(camera.waitUntilReady).mockRejectedValue(new Error('Camera disconnected'));
    engine.start(); await engine.settled();
    expect(engine.snapshot().status).toBe('ERROR'); expect(camera.capture).not.toHaveBeenCalled();
  });
});
