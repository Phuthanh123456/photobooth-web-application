import sharp from 'sharp';
import {expect,it} from 'vitest';
import {previewJpeg} from '../src/preview-jpeg.js';
const image=()=>sharp({create:{width:64,height:32,channels:3,background:'blue'}}).jpeg().toBuffer();
it('removes Nikon buffer padding and stale old frame data without changing decoded pixels',async()=>{
  const jpeg=await image();const padded=Buffer.concat([jpeg,Buffer.alloc(2048),jpeg,Buffer.alloc(8192)]);
  const trimmed=previewJpeg(padded);expect(trimmed).toEqual(jpeg);
  expect(await sharp(trimmed!).raw().toBuffer()).toEqual(await sharp(padded).raw().toBuffer());
});
it('does not mistake EOI inside an APP/thumbnail segment for the main JPEG end',async()=>{
  const jpeg=await image();const app=Buffer.from([255,225,0,8,65,66,255,217,67,68]);
  const withApp=Buffer.concat([jpeg.subarray(0,2),app,jpeg.subarray(2)]);
  expect(previewJpeg(Buffer.concat([withApp,Buffer.alloc(1024)]))).toEqual(withApp);
});
it('supports progressive multi-scan JPEG previews',async()=>{
  const jpeg=await sharp(await image()).jpeg({progressive:true}).toBuffer();
  expect(previewJpeg(Buffer.concat([jpeg,Buffer.alloc(4096)]))).toEqual(jpeg);
});
it('rejects malformed/truncated previews rather than streaming arbitrary buffers',async()=>{
  const jpeg=await image();
  for(const bytes of [Buffer.from('not JPEG'),Buffer.from([255,216,255,217]),jpeg.subarray(0,jpeg.length-2),Buffer.from([255,216,255,225,255,255])]) expect(previewJpeg(bytes)).toBeNull();
});
