import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import sharp, { type OverlayOptions } from 'sharp';
import { PDFDocument, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';

export const templateDirectory = fileURLToPath(new URL('../../assets/templates/', import.meta.url));
export interface Slot { x: number; y: number; width: number; height: number; photo: number; column: number }
export interface TemplatePage { page: number; name: string; widthPt: number; heightPt: number; dpi: number; slots: Slot[] }
export const templates: { pages: TemplatePage[] } = JSON.parse(await readFile(path.join(templateDirectory, 'geometry.json'), 'utf8'));
export function template(page = 1) {
  const selected = templates.pages.find(p => p.page === page);
  if (!selected) throw new Error('Unknown frame template');
  return selected;
}
export async function verifyJpeg(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error('Invalid or incomplete JPEG');
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 80_000_000 });
  const metadata = await image.metadata();
  if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) throw new Error('Invalid JPEG dimensions');
  // Decode all pixels: metadata alone does not prove the image is complete.
  await image.stats();
  return { width: metadata.width, height: metadata.height };
}
export async function composeJpeg(images: Map<number, Uint8Array>, page = 1, dpi = 300) {
  const geometry = template(page);
  const scale = dpi / 72;
  const width = Math.ceil(geometry.widthPt * dpi / 72), height = Math.ceil(geometry.heightPt * dpi / 72);
  const layers: OverlayOptions[] = [];
  for (const slot of geometry.slots) {
    const original = images.get(slot.photo);
    if (!original) continue;
    const left = Math.round(slot.x * scale), top = Math.round(slot.y * scale);
    const w = Math.round((slot.x + slot.width) * scale) - left;
    const h = Math.round((slot.y + slot.height) * scale) - top;
    const input = await sharp(original, { failOn: 'warning' }).autoOrient().resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
    layers.push({ input, left, top });
  }
  return sharp(path.join(templateDirectory, `page-${page}.png`)).resize(width, height).composite(layers).withMetadata({ density: dpi }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
}
export async function composePdf(images: Map<number, Uint8Array>, pageNumber = 1) {
  const geometry = template(pageNumber);
  const document = await PDFDocument.create();
  const source = await PDFDocument.load(await readFile(path.join(templateDirectory, 'Frame CAP.pdf')));
  const [background] = await document.embedPages([source.getPage(pageNumber - 1)]);
  const page = document.addPage([geometry.widthPt, geometry.heightPt]);
  page.drawPage(background, { x: 0, y: 0 });
  for (const [photo, bytes] of images) {
    // Normalize EXIF orientation once; otherwise preserve original compressed JPEG bytes.
    const metadata = await sharp(bytes).metadata();
    const oriented = metadata.orientation && metadata.orientation !== 1 ? await sharp(bytes).autoOrient().jpeg({ quality: 98 }).toBuffer() : bytes;
    const jpeg = await document.embedJpg(oriented);
    for (const slot of geometry.slots.filter(s => s.photo === photo)) {
      const scale = Math.max(slot.width / jpeg.width, slot.height / jpeg.height);
      const w = jpeg.width * scale, h = jpeg.height * scale;
      const y = geometry.heightPt - slot.y - slot.height;
      page.pushOperators(pushGraphicsState(), rectangle(slot.x, y, slot.width, slot.height), clip(), endPath());
      page.drawImage(jpeg, { x: slot.x + (slot.width - w) / 2, y: y + (slot.height - h) / 2, width: w, height: h });
      page.pushOperators(popGraphicsState());
    }
  }
  return document.save();
}
