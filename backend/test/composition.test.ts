import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { composeJpeg, composePdf, templates, verifyJpeg } from '../src/composition.js';
import { MockCameraAdapter } from '../src/camera.js';

it('uses actual PDF geometry and maps each of four photos twice on both designs', () => {
  expect(templates.pages).toHaveLength(2);
  for (const page of templates.pages) {
    expect(page.slots).toHaveLength(8);
    for (let photo = 1; photo <= 4; photo++) {
      const slots = page.slots.filter(s => s.photo === photo);
      expect(slots.map(s => s.column)).toEqual([0, 1]);
      expect(slots[0].y).toBe(slots[1].y);
      expect(slots[0].x).toBeCloseTo(34.993, 3);
      expect(slots[1].x).toBeCloseTo(220.993, 3);
    }
  }
});
it('progressively fills both slots without changing empty rows or artwork', async () => {
  const jpeg = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#ff0000' } }).jpeg().toBuffer();
  const bytes = await composeJpeg(new Map([[1, jpeg]]), 1, 72);
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  expect(pixel(100, 80)[0]).toBeGreaterThan(245);
  expect(pixel(290, 80)[1]).toBeLessThan(10);
  expect(pixel(100, 180)).toEqual([255,255,255]);
  expect(pixel(10,10)[1]).toBeLessThan(150);
});
it('exports JPEG at 300 dpi and PDF at the exact source page dimensions', async () => {
  const image = await new MockCameraAdapter().capture({ sessionId: 'test', photo: 1 });
  expect(image.extension).toBe('jpg'); await verifyJpeg(image.bytes);
  const images = new Map([1,2,3,4].map(photo => [photo, image.bytes]));
  for (const page of templates.pages) {
    const jpeg = await composeJpeg(images, page.page);
    const metadata = await sharp(jpeg).metadata();
    expect(metadata.width).toBe(Math.ceil(page.widthPt * 300 / 72));
    expect(metadata.density).toBe(300);
    const pdf = await PDFDocument.load(await composePdf(images, page.page));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(page.widthPt, 3);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(page.heightPt, 3);
  }
});
it('rejects truncated and falsely labeled JPEG data', async () => {
  await expect(verifyJpeg(Buffer.from('<svg/>'))).rejects.toThrow('JPEG');
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).jpeg().toBuffer();
  await expect(verifyJpeg(jpeg.subarray(0,jpeg.length-10))).rejects.toThrow();
});
