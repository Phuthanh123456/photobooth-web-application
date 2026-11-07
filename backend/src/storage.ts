import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { CaptureRecord, SessionState } from '@photobooth/shared';
import type { CameraImage } from './camera.js';
import { composeJpeg, composePdf, verifyJpeg, template } from './composition.js';

export type Output = NonNullable<SessionState['output']>;
export interface SessionStorage {
  readonly templatePage?: number;
  readonly outputFolder?: string;
  manifest(state: SessionState): Promise<void>;
  save(sessionId: string, photo: number, image: CameraImage): Promise<Pick<CaptureRecord, 'file' | 'bytes' | 'sha256' | 'savedAt'>>;
  verify(sessionId: string, records: CaptureRecord[]): Promise<void>;
  progress?(state: SessionState): Promise<string>;
  finalize?(state: SessionState): Promise<Output>;
  cleanup?(id: string, deleteCompleted: boolean): Promise<void>;
}
export const validSessionId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function atomic(target: string, bytes: Uint8Array | string) {
  await writeFile(`${target}.tmp`, bytes); await rename(`${target}.tmp`, target);
}
export class FileSessionStorage implements SessionStorage {
  readonly outputFolder: string;
  readonly root: string;
  constructor(root: string, readonly templatePage = 1) { this.root = path.resolve(root); this.outputFolder = path.join(this.root, 'output'); template(templatePage); }
  sessionDirectory(id: string) { if (!validSessionId(id)) throw new Error('Invalid session ID'); return path.join(this.root, 'temp', `session-${id}`); }
  outputFile(id: string, kind: 'jpg' | 'pdf' | 'manifest') {
    if (!validSessionId(id)) throw new Error('Invalid session ID');
    return path.join(this.outputFolder, `photobooth-${id}-${kind === 'manifest' ? 'manifest.json' : `final.${kind}`}`);
  }
  async manifest(state: SessionState) {
    if (!state.sessionId) return;
    const dir = this.sessionDirectory(state.sessionId);
    await mkdir(dir, { recursive: true });
    await atomic(path.join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 2, ...state }, null, 2));
  }
  async save(id: string, photo: number, image: CameraImage) {
    if (!image.bytes.length) throw new Error('Empty camera image');
    if (image.extension !== 'jpg') throw new Error('Only original JPEG captures are accepted');
    if (![1,2,3,4].includes(photo)) throw new Error('Invalid photo number');
    const dimensions = await verifyJpeg(image.bytes);
    const file = `capture-${String(photo).padStart(2,'0')}.jpg`;
    const target = path.join(this.sessionDirectory(id), file);
    await writeFile(`${target}.tmp`, image.bytes, { flag: 'wx' }); await rename(`${target}.tmp`, target);
    const stored = await readFile(target);
    if (stored.length !== image.bytes.length || hash(stored) !== hash(image.bytes)) throw new Error('Saved image verification failed');
    await verifyJpeg(stored);
    return { file, bytes: stored.length, sha256: hash(stored), savedAt: new Date().toISOString(), ...dimensions };
  }
  private captureFile(id: string, record: CaptureRecord) {
    if (!/^capture-0[1-4]\.jpg$/.test(record.file ?? '')) throw new Error('Invalid internal capture filename');
    return path.join(this.sessionDirectory(id), record.file!);
  }
  async verify(id: string, records: CaptureRecord[]) {
    if (records.length !== 4 || ![1,2,3,4].every(photo => records.some(r => r.photo === photo)) || new Set(records.map(r => r.file)).size !== 4) throw new Error('Four distinct image records required');
    for (const record of records) {
      if (record.status !== 'saved' || !record.file || !record.bytes || !record.sha256) throw new Error('Unverified image record');
      const stored = await readFile(this.captureFile(id, record));
      if (stored.length !== record.bytes || hash(stored) !== record.sha256) throw new Error('Final image verification failed');
      await verifyJpeg(stored);
    }
  }
  private async images(state: SessionState) {
    const images = new Map<number, Uint8Array>();
    for (const record of state.captures.filter(r => r.status === 'saved')) images.set(record.photo, await readFile(this.captureFile(state.sessionId!, record)));
    return images;
  }
  async progress(state: SessionState) {
    const images = await this.images(state);
    await atomic(path.join(this.sessionDirectory(state.sessionId!), 'frame.jpg'), await composeJpeg(images, this.templatePage, 120));
    return `/media/${state.sessionId}/frame?v=${images.size}`;
  }
  async finalize(state: SessionState) {
    const id = state.sessionId!;
    await this.verify(id, state.captures);
    const images = await this.images(state);
    await mkdir(this.outputFolder, { recursive: true });
    const jpg = await composeJpeg(images, this.templatePage);
    const pdf = await composePdf(images, this.templatePage);
    const descriptors: Record<string, { bytes: number; sha256: string }> = {};
    for (const [kind, bytes] of [['jpg',jpg],['pdf',pdf]] as const) {
      const target = this.outputFile(id,kind); await atomic(target,bytes);
      const stored = await readFile(target);
      if (hash(stored) !== hash(bytes)) throw new Error('Final deliverable verification failed');
      if (kind === 'jpg') {
        const dimensions = await verifyJpeg(stored); const geometry = template(this.templatePage);
        if (dimensions.width !== Math.ceil(geometry.widthPt * 300 / 72) || dimensions.height !== Math.ceil(geometry.heightPt * 300 / 72)) throw new Error('Final JPG dimensions incorrect');
      } else {
        const document = await PDFDocument.load(stored), geometry = template(this.templatePage);
        if (document.getPageCount() !== 1 || Math.abs(document.getPage(0).getWidth()-geometry.widthPt) > .001 || Math.abs(document.getPage(0).getHeight()-geometry.heightPt) > .001) throw new Error('Final PDF print dimensions incorrect');
      }
      descriptors[kind] = { bytes: stored.length, sha256: hash(stored) };
    }
    const output = { jpgUrl: `/media/${id}/output/jpg`, pdfUrl: `/media/${id}/output/pdf`, manifestUrl: `/media/${id}/output/manifest` };
    const manifest = { schemaVersion:2, sessionId:id, camera:state.camera, status:'COMPLETE', templatePage:this.templatePage, createdAt:new Date().toISOString(), captures:state.captures, deliverables:descriptors };
    const manifestFile = this.outputFile(id,'manifest');
    await atomic(manifestFile,JSON.stringify(manifest,null,2));
    const verified = JSON.parse(await readFile(manifestFile,'utf8'));
    if (verified.sessionId !== id || verified.status !== 'COMPLETE' || Object.keys(verified.deliverables).length !== 2) throw new Error('Output manifest verification failed');
    return output;
  }
  async cleanup(id: string, deleteCompleted: boolean) {
    const dir = this.sessionDirectory(id);
    const tempRoot = path.resolve(this.root,'temp');
    if (path.dirname(path.resolve(dir)) !== tempRoot) throw new Error('Unsafe cleanup boundary');
    const rootReal = await realpath(this.root);
    for (const parent of ['temp','output']) {
      const actual = await realpath(path.join(this.root,parent)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (actual && path.relative(rootReal,actual).toLowerCase() !== parent) throw new Error('Refusing cleanup through a redirected storage directory');
    }
    const stat = await lstat(dir).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('Refusing cleanup through a symbolic link');
    // A completed output marker protects finals even if the process died before state publication.
    const completed = await readFile(this.outputFile(id,'manifest'),'utf8').then(text => JSON.parse(text).status === 'COMPLETE').catch(error => { if (error.code === 'ENOENT') return false; throw error; });
    if (deleteCompleted || !completed) for (const kind of ['jpg','pdf','manifest'] as const) {
      await rm(this.outputFile(id,kind),{ force:true }); await rm(`${this.outputFile(id,kind)}.tmp`,{ force:true });
    }
    await rm(dir,{ recursive:true, force:true });
  }
  async recoverInterrupted(): Promise<SessionState | null> {
    let latest: SessionState | null = null;
    const entries = await readdir(path.join(this.root,'temp'),{withFileTypes:true}).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of entries) {
      const id = entry.name.replace(/^session-/,'');
      if (!entry.isDirectory() || !validSessionId(id)) continue;
      const state: SessionState = JSON.parse(await readFile(path.join(this.sessionDirectory(id),'manifest.json'),'utf8'));
      if (state.status === 'COMPLETE' || state.status === 'CANCELLED' || state.status === 'ERROR') continue;
      state.status = 'ERROR'; state.busy = false; state.countdownDeadlineMs = null; state.remainingSeconds = 0;
      state.error = 'Backend restarted during a session. Inspect camera/storage and reset; no shutter was retried.';
      await this.manifest(state); latest = state;
    }
    return latest;
  }
}
