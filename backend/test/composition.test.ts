import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { composeJpeg, composePdf, templates, verifyJpeg } from '../src/composition.js';
import { MockCameraAdapter } from '../src/camera.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {templateDirectory} from '../src/composition.js';

it('maps four photos twice to the eight differently positioned PNG openings', () => {
  expect(templates.pages).toHaveLength(1);
  for (const page of templates.pages) {
    expect(page.slots).toHaveLength(8);
    for (let photo = 1; photo <= 4; photo++) {
      const slots = page.slots.filter(s => s.photo === photo);
      expect(slots.map(s => s.column)).toEqual([0, 1]);
      expect(slots[0].x).toBeLessThan(page.widthPt/2);
      expect(slots[1].x).toBeGreaterThan(page.widthPt/2);
      for(const slot of slots) {
        const box=slot.contentBox;
        expect(box.x).toBeGreaterThanOrEqual(slot.x);expect(box.y).toBeGreaterThanOrEqual(slot.y);
        expect(box.x+box.width).toBeLessThanOrEqual(slot.x+slot.width+.001);
        expect(box.y+box.height).toBeLessThanOrEqual(slot.y+slot.height+.001);
      }
    }
    for(const column of [0,1]) expect(page.slots.filter(s=>s.column===column).map(s=>s.y)).toEqual(page.slots.filter(s=>s.column===column).map(s=>s.y).sort((a,b)=>a-b));
  }
});
it('preserves the supplied RGBA bytes and keeps every photo rectangle clear of stickers',async()=> {
  const page=templates.pages[0],bytes=await readFile(path.join(templateDirectory,page.artwork));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(page.sourceSha256);
  expect(page.sourceSha256).toBe('f25c5f60b8cc632ccaa21200af61ab9327cbf313f7bd4a2e8feb2d6c0216d836');
  expect((await sharp(bytes).metadata()).hasAlpha).toBe(true);
  const scale=page.sourceDpi/72;
  for(const {contentBox:box} of page.slots) {
    const {data,info}=await sharp(bytes).extract({left:Math.round(box.x*scale),top:Math.round(box.y*scale),width:Math.round(box.width*scale),height:Math.round(box.height*scale)}).raw().toBuffer({resolveWithObject:true});
    expect(info.channels).toBe(4);
    for(let i=3;i<data.length;i+=4) if(data[i]!==0) throw new Error('Sticker covers the safe photo rectangle');
  }
});
it('progressively fills both slots without changing empty rows or artwork', async () => {
  const jpeg = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#ff0000' } }).jpeg().toBuffer();
  const bytes = await composeJpeg(new Map([[1, jpeg]]), 1, 72);
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  const center=(photo:number,column:number)=>{const box=templates.pages[0].slots.find(s=>s.photo===photo && s.column===column)!.contentBox;return pixel(Math.round(box.x+box.width/2),Math.round(box.y+box.height/2));};
  expect(center(1,0)[0]).toBeGreaterThan(245);
  expect(center(1,1)[1]).toBeLessThan(10);
  expect(center(2,0)).toEqual([255,255,255]);
  expect(pixel(10,10)[1]).toBeLessThan(150);
});
it('keeps sticker artwork above filled photo areas',async()=> {
  const original=await sharp({create:{width:600,height:400,channels:3,background:'red'}}).jpeg().toBuffer();
  const before=await sharp(await composeJpeg(new Map(),1,72)).raw().toBuffer({resolveWithObject:true});
  const after=await sharp(await composeJpeg(new Map([1,2,3,4].map(photo=>[photo,original])),1,72)).raw().toBuffer({resolveWithObject:true});
  // Speech bubble, badge, star and key coordinates in the original source.
  for(const [sx,sy] of [[400,300],[1290,900],[1100,1100],[2220,2630]]) {
    const x=Math.round(sx*72/templates.pages[0].sourceDpi),y=Math.round(sy*72/templates.pages[0].sourceDpi);
    const index=(y*after.info.width+x)*after.info.channels;
    for(let c=0;c<3;c++) expect(Math.abs(after.data[index+c]-before.data[index+c])).toBeLessThan(15);
  }
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
it('preserves both edges of a wide photo instead of cropping them to fill the slot',async()=> {
  const edge=(color:string)=>sharp({create:{width:60,height:300,channels:3,background:color}}).png().toBuffer();
  const original=await sharp({create:{width:600,height:300,channels:3,background:'red'}}).composite([{input:await edge('lime'),left:0,top:0},{input:await edge('blue'),left:540,top:0}]).jpeg().toBuffer();
  const {data,info}=await sharp(await composeJpeg(new Map([[1,original]]),1,72)).raw().toBuffer({resolveWithObject:true});
  const pixel=(x:number,y:number)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
  const box=templates.pages[0].slots[0].contentBox;
  const left=Math.round(box.x)+5,right=Math.round(box.x+box.width)-5,y=Math.round(box.y+box.height/2);
  expect(pixel(left,y)[1]).toBeGreaterThan(220);expect(pixel(right,y)[2]).toBeGreaterThan(220);
  expect(pixel(left,y)[0]).toBeLessThan(30);expect(pixel(right,y)[0]).toBeLessThan(30);
});
