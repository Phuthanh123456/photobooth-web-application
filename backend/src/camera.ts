import sharp from 'sharp';
export interface CaptureRequest { sessionId: string; photo: number }
export interface CameraImage { bytes: Uint8Array; extension: 'svg' | 'jpg' }
/** Future Nikon bridge must resolve capture only after transfer completion.
 * A rejected capture can represent an uncertain shutter: never retry it.
 * waitUntilReady must confirm hardware readiness, not merely transfer completion. */
export interface NikonCameraAdapter {
  readonly kind: 'mock' | 'nikon';
  readonly status?: string;
  readonly canStartSession?: boolean;
  readonly latestFrame?: { bytes: Buffer; at: number };
  readonly previewStatus?: string;
  assertSessionAllowed?(): void;
  cleanupSession?(sessionId: string): Promise<void>;
  waitUntilReady(): Promise<void>;
  capture(request: CaptureRequest): Promise<CameraImage>;
}
export class MockCameraAdapter implements NikonCameraAdapter {
  readonly kind = 'mock';
  private capturing = false;
  async waitUntilReady(): Promise<void> {
    if (this.capturing) throw new Error('Camera busy');
  }
  async capture({ photo }: CaptureRequest): Promise<CameraImage> {
    if (this.capturing) throw new Error('Overlapping shutter command');
    this.capturing = true;
    try {
      await new Promise(resolve => setTimeout(resolve, 180));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="${['#295d71','#714665','#3f7159','#826138'][photo-1]}"/><circle cx="900" cy="490" r="260" fill="#ffffff22"/><text x="900" y="820" text-anchor="middle" fill="white" font-family="sans-serif" font-size="100">MOCK PHOTO ${photo} / 4</text><text x="900" y="930" text-anchor="middle" fill="white" font-family="sans-serif" font-size="38">TEST IMAGE — NOT A NIKON CAPTURE</text></svg>`;
      return { extension: 'jpg', bytes: await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer() };
    } finally { this.capturing = false; }
  }
}
