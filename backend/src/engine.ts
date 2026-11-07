import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { COUNTDOWN_MS, PHOTO_COUNT, type SessionState, type Status } from '@photobooth/shared';
import type { NikonCameraAdapter } from './camera.js';
import type { SessionStorage } from './storage.js';

export interface Clock { now(): number; sleep(ms: number): Promise<void> }
export const monotonicClock: Clock = { now: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) };
const initial = (): SessionState => ({ sessionId: null, status: 'IDLE', photo: 0, camera: 'mock', countdownDeadlineMs: null, remainingSeconds: 0, serverNowMs: 0, captures: [], busy: false });

export class SessionEngine extends EventEmitter {
  private state = initial();
  private cancelled = false;
  private task: Promise<void> = Promise.resolve();
  constructor(private camera: NikonCameraAdapter, private storage: SessionStorage, private clock: Clock = monotonicClock) { super(); }
  snapshot(): SessionState {
    return structuredClone({ ...this.state, serverNowMs: this.clock.now(), remainingSeconds: this.state.status === 'COUNTDOWN' && this.state.countdownDeadlineMs !== null ? Math.max(0, Math.ceil((this.state.countdownDeadlineMs - this.clock.now()) / 1000)) : 0 });
  }
  private publish() { this.emit('state', this.snapshot()); }
  start(): void {
    if (this.state.busy || !['IDLE', 'COMPLETE'].includes(this.state.status)) throw new Error('Session cannot start; cancel or acknowledge the current session first');
    this.cancelled = false;
    this.state = { ...initial(), busy: true, sessionId: randomUUID(), captures: Array.from({ length: PHOTO_COUNT }, (_, i) => ({ photo: i + 1, status: 'pending' })) };
    this.publish();
    this.task = this.run();
  }
  cancel(): void {
    if (!this.state.busy || this.cancelled || this.state.status === 'ERROR') throw new Error('No active session to cancel');
    this.cancelled = true;
    this.state.status = 'CANCELLED';
    this.state.countdownDeadlineMs = null;
    this.publish();
  }
  reset(): void {
    if (this.state.busy || !['ERROR', 'CANCELLED'].includes(this.state.status)) throw new Error('Wait for the camera to settle before acknowledging');
    this.state = initial();
    this.publish();
  }
  settled() { return this.task; }
  private async transition(status: Status) {
    this.state.status = status;
    if (status !== 'COUNTDOWN') this.state.countdownDeadlineMs = null;
    // Publish only after this transition is recorded on disk.
    await this.storage.manifest(this.snapshot());
    if (!this.cancelled) this.publish();
  }
  private async run() {
    try {
      await this.storage.manifest(this.snapshot());
      for (let photo = 1; photo <= PHOTO_COUNT; photo++) {
        if (this.cancelled) break;
        await this.camera.waitUntilReady();
        if (this.cancelled) break;
        this.state.photo = photo;
        this.state.countdownDeadlineMs = this.clock.now() + COUNTDOWN_MS;
        await this.transition('COUNTDOWN');
        let lastSeconds = -1;
        while (!this.cancelled && this.clock.now() < this.state.countdownDeadlineMs!) {
          const seconds = this.snapshot().remainingSeconds;
          if (seconds !== lastSeconds) { lastSeconds = seconds; this.publish(); }
          await this.clock.sleep(Math.min(50, Math.max(0, this.state.countdownDeadlineMs! - this.clock.now())));
        }
        if (this.cancelled) break;
        const record = this.state.captures[photo - 1];
        record.status = 'capturing';
        await this.transition('CAPTURING');
        if (this.cancelled) { record.status = 'pending'; break; }
        record.shutterAtMs = this.clock.now();
        // Exactly one shutter call. A rejection may mean the shutter fired.
        const image = await this.camera.capture({ sessionId: this.state.sessionId!, photo });
        if (!this.cancelled) await this.transition('SAVING');
        // Finish saving an already exposed image even after cancellation.
        Object.assign(record, await this.storage.save(this.state.sessionId!, photo, image), { status: 'saved' });
        await this.storage.manifest(this.snapshot());
        if (this.cancelled) break;
        if (photo === PHOTO_COUNT) {
          await this.camera.waitUntilReady();
          await this.storage.verify(this.state.sessionId!, this.state.captures);
          if (this.cancelled) break;
          await this.transition('COMPLETE');
        }
      }
    } catch (error) {
      const record = this.state.captures[this.state.photo - 1];
      if (record && record.status !== 'saved') record.status = 'failed';
      this.state.error = `${error instanceof Error ? error.message : String(error)}. Inspect camera and storage, then acknowledge; no automatic retry.`;
      this.state.status = 'ERROR';
      this.state.countdownDeadlineMs = null;
    } finally {
      // Keep the lock through final persistence. Failure to persist is an error.
      if (this.cancelled && this.state.status !== 'ERROR') this.state.status = 'CANCELLED';
      try { await this.storage.manifest({ ...this.snapshot(), busy: false }); }
      catch (error) { this.state.status = 'ERROR'; this.state.error = `Manifest persistence failed: ${String(error)}. Inspect storage and acknowledge.`; }
      this.state.busy = false;
      this.state.countdownDeadlineMs = null;
      this.publish();
    }
  }
}
