import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

test('cloud guest page downloads its own JPG over an independent origin and reports bad links',async({page})=> {
  const directory=fileURLToPath(new URL('../../cloud/guest/',import.meta.url));
  const jpeg=await sharp({create:{width:64,height:96,channels:3,background:'#193b33'}}).jpeg().toBuffer();
  await page.route('https://guest.cap.test/**',async route=> {
    const name=new URL(route.request().url()).pathname.slice(1) || 'index.html';
    if(!['index.html','guest.js','style.css'].includes(name)) {await route.fulfill({status:404});return;}
    await route.fulfill({body:await readFile(directory+name),contentType:name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
  });
  const token='A'.repeat(32),uid='1534f310-bdc0-4f97-8f25-3729d3030980';
  let probes=0;
  await page.route(`https://example.supabase.co/storage/v1/object/public/cap-photos/${uid}/${token}.jpg*`,route=> {
    if(route.request().method()==='HEAD' && ++probes===1) return route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'}});
    return route.fulfill({body:route.request().method()==='HEAD' ? '' : jpeg,contentType:'image/jpeg',headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto(`https://guest.cap.test/#example/cap-photos/${uid}/${token}.jpg`);
  await expect(page.getByRole('status')).toContainText('Trang sẽ tự cập nhật');
  await expect(page.getByRole('status')).toHaveText('Ảnh của bạn đã sẵn sàng.');
  await expect(page.getByAltText('Bốn ảnh của bạn trong khung CAP')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Tải ảnh JPG'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe(`CAP-${token}.jpg`);
  const file=await download.path();expect(await readFile(file!)).toEqual(jpeg);
  await page.goto('https://guest.cap.test/#https://evil.example/steal');
  await expect(page.getByRole('status')).toContainText('Mã ảnh không hợp lệ');await expect(page.getByRole('link',{name:'Tải ảnh JPG'})).toBeHidden();
});
