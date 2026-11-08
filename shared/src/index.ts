export const PHOTO_COUNT = 4;
export const COUNTDOWN_MS = 10_000;
export type Status = 'IDLE' | 'COUNTDOWN' | 'CAPTURING' | 'SAVING' | 'COMPOSING' | 'RESETTING' | 'COMPLETE' | 'ERROR' | 'CANCELLED';
export interface CaptureRecord {
  photo: number;
  status: 'pending' | 'capturing' | 'saved' | 'failed';
  shutterAtMs?: number;
  savedAt?: string;
  file?: string;
  bytes?: number;
  sha256?: string;
  width?: number;
  height?: number;
}
export interface SessionState {
  sessionId: string | null;
  status: Status;
  photo: number;
  camera: 'mock' | 'nikon';
  cameraMode?: 'MOCK' | 'REAL_NIKON';
  canStartSession?: boolean;
  countdownDeadlineMs: number | null;
  remainingSeconds: number;
  serverNowMs: number;
  captures: CaptureRecord[];
  error?: string;
  busy: boolean;
  previewUrl?: string;
  templatePage?: number;
  cameraStatus?: string;
  liveViewUrl?: string;
  liveViewStatus?: string;
  outputFolder?: string;
  output?: { jpgUrl: string; pdfUrl: string; manifestUrl: string; sharePath?:string };
  share?: { url:string; qrImagePath:string };
  desktopSave?: DesktopSaveState;
}
export interface DesktopSaveState {
  status: 'queued' | 'choosing' | 'saving' | 'saved' | 'cancelled' | 'error';
  path?: string;
  error?: string;
}
export type ClientCommand = { type: 'START' | 'CANCEL' | 'RESET' | 'SAVE_AS'; requestId: string; sessionId?: string | null; confirmDeleteCompleted?: boolean };
export type ServerEvent = { type: 'STATE'; state: SessionState } | { type: 'COMMAND_RESULT'; requestId: string; ok: boolean; error?: string };
