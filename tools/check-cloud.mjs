import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {SupabasePhotoCloud} from '../backend/src/cloud-share.ts';
const config=JSON.parse((await readFile(fileURLToPath(new URL('../.local/cloud-config.json',import.meta.url)),'utf8')).replace(/^\uFEFF/,''));
const cloud=new SupabasePhotoCloud(config),token=randomBytes(24).toString('base64url');
const site=await fetch(config.guestOrigin,{signal:AbortSignal.timeout(15000)});
if(!site.ok || !(await site.text()).includes('guest.js')) throw new Error('Guest static site is not deployed at this origin');
try {
  const jpeg=await sharp({create:{width:32,height:32,channels:3,background:'#193b33'}}).jpeg().toBuffer();
  await cloud.publish(token,jpeg);console.log('Cloud test JPG uploaded and SHA-256 read-back verified. No camera commands were sent.');
} finally {await cloud.remove(token);}
console.log('Cloud test object deleted.');
