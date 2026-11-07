import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureRecord, SessionState } from '@photobooth/shared';
import type { CameraImage } from './camera.js';

export interface SessionStorage {
  manifest(state: SessionState): Promise<void>;
  save(sessionId: string, photo: number, image: CameraImage): Promise<Pick<CaptureRecord, 'file' | 'bytes' | 'sha256' | 'savedAt'>>;
  verify(sessionId: string, records: CaptureRecord[]): Promise<void>;
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export class FileSessionStorage implements SessionStorage {
  constructor(readonly root: string) {}
  private directory(id: string) { return path.join(this.root, id); }
  async manifest(state: SessionState) {
    if (!state.sessionId) return;
    const dir = this.directory(state.sessionId);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, 'manifest.json');
    await writeFile(`${target}.tmp`, JSON.stringify({ schemaVersion: 1, ...state }, null, 2));
    await rename(`${target}.tmp`, target);
  }
  async save(id: string, photo: number, image: CameraImage) {
    if (!image.bytes.length) throw new Error('Empty camera image');
    const file = `${photo}.${image.extension}`;
    const target = path.join(this.directory(id), file);
    await writeFile(`${target}.tmp`, image.bytes, { flag: 'wx' });
    await rename(`${target}.tmp`, target);
    const stored = await readFile(target);
    if (stored.length !== image.bytes.length || hash(stored) !== hash(image.bytes)) throw new Error('Saved image verification failed');
    return { file, bytes: stored.length, sha256: hash(stored), savedAt: new Date().toISOString() };
  }
  async verify(id: string, records: CaptureRecord[]) {
    if (records.length !== 4 || ![1, 2, 3, 4].every(photo => records.some(r => r.photo === photo)) || new Set(records.map(r => r.file)).size !== 4) throw new Error('Four distinct image records required');
    for (const record of records) {
      if (record.status !== 'saved' || !record.file || !record.bytes || !record.sha256) throw new Error('Unverified image record');
      const stored = await readFile(path.join(this.directory(id), record.file));
      if (stored.length !== record.bytes || hash(stored) !== record.sha256) throw new Error('Final image verification failed');
    }
  }
}
