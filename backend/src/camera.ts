export interface CaptureRequest { sessionId: string; photo: number }
export interface CameraImage { bytes: Uint8Array; extension: 'svg' | 'jpg' }
/** Future Nikon bridge must resolve capture only after transfer completion.
 * A rejected capture can represent an uncertain shutter: never retry it.
 * waitUntilReady must confirm hardware readiness, not merely transfer completion. */
export interface NikonCameraAdapter {
  readonly kind: 'mock' | 'nikon';
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
      return { extension: 'svg', bytes: new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#153a40"/><circle cx="600" cy="320" r="180" fill="#28646a"/><text x="600" y="570" text-anchor="middle" fill="#e2eece" font-family="sans-serif" font-size="64">MOCK PHOTO ${photo} / 4</text></svg>`) };
    } finally { this.capturing = false; }
  }
}
