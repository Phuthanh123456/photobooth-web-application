import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import QRCode from 'qrcode';
import {readFile} from 'node:fs/promises';

test('completed frame and scannable QR fit beside each other on iPad and stack on phones',async({page},testInfo)=> {
  const id='77777777-7777-4777-8777-777777777777',token='x'.repeat(32),url=`https://photos.example.test/s/${token}`;
  const frame=await readFile(new URL('../../assets/templates/page-1.png',import.meta.url));
  const svg=await QRCode.toString(url,{type:'svg',width:320,margin:4});
  await page.route('**/media/*/frame',route=>route.fulfill({contentType:'image/png',body:frame}));
  await page.route('**/s/*/qr.svg*',route=>route.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.routeWebSocket('**/ws?role=display',socket=> {
    const send=()=>socket.send(JSON.stringify({type:'STATE',state:{status:'COMPLETE',camera:'mock',sessionId:id,photo:4,captures:[],busy:false,share:{url,qrImagePath:`/s/${token}/qr.svg`}}}));
    send();const heartbeat=setInterval(send,500);socket.onClose(()=>clearInterval(heartbeat));
  });
  for(const size of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewportSize(size);await page.goto('/display');
    const qr=page.getByRole('img',{name:'Mã QR tải ảnh của lượt chụp này'});await expect(qr).toBeVisible();
    await expect.poll(()=>qr.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const image=await page.locator('.completed-artwork').boundingBox(),card=await page.locator('.session-qr').boundingBox();
    expect(image).not.toBeNull();expect(card).not.toBeNull();
    if(size.width>640) {
      expect(card!.x).toBeGreaterThan(image!.x+image!.width);
      expect(card!.y+card!.height).toBeLessThanOrEqual(size.height+1);
      expect(image!.y+image!.height).toBeLessThanOrEqual(size.height+1);
    } else expect(card!.y).toBeGreaterThan(image!.y+image!.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('button')).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath(`qr-${size.width}.png`),fullPage:true});
  }
});

test('operator loads the supplied sticker frame with an artwork cache key',async({page})=> {
  await page.goto('/operator');await expect(page.getByText('Connected',{exact:true})).toBeVisible();
  const frame=page.getByRole('img',{name:'Progressive Frame CAP double strip'});
  await expect(frame).toHaveAttribute('src',/page-1\.png\?v=f25c5f60/);
  await expect.poll(()=>frame.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(2335);
  await expect(page.getByText('Frame CAP · CAP / Victory stickers')).toBeVisible();
});

test('countdown flashes without any Smile, saving or composing card obscuring the camera',async({page})=> {
  let status='COUNTDOWN',publish=()=>{};
  await page.routeWebSocket('**/ws?role=display',socket=> {
    publish=()=>socket.send(JSON.stringify({type:'STATE',state:{sessionId:'display-test',status,camera:'mock',photo:1,remainingSeconds:10,captures:[],busy:true}}));
    publish();const heartbeat=setInterval(publish,500);socket.onClose(()=>clearInterval(heartbeat));
  });
  await page.goto('/display');await expect(page.locator('.countdown')).toHaveText('10');
  status='CAPTURING';publish();await expect(page.locator('.guidance')).toHaveCount(0);await expect(page.locator('.flash')).toHaveCount(1);
  for(const next of ['SAVING','COMPOSING']) {
    status=next;publish();await expect(page.locator('.guidance, .flash')).toHaveCount(0);
  }
  status='COUNTDOWN';publish();await expect(page.locator('.countdown')).toHaveText('10');
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('Live View updates, hides a lost stream, and reconnects without replaying controls',async({page})=> {
  let available=true,frozen=false,sequence=0,commands=0;
  const jpeg=await sharp({create:{width:64,height:32,channels:3,background:'blue'}}).jpeg().toBuffer();
  await page.routeWebSocket('**/ws?role=display',socket=> {
    const send=()=>socket.send(JSON.stringify({type:'STATE',state:{status:'IDLE',camera:'nikon',photo:0,captures:[],busy:false,liveViewUrl:'/live-view.mjpg'}}));
    send();const heartbeat=setInterval(send,500);socket.onClose(()=>clearInterval(heartbeat));
    socket.onMessage(()=>commands++);
  });
  await page.route('**/live-view.jpg',route=>route.fulfill(available ? {status:200,contentType:'image/jpeg',headers:{'X-Frame-Id':String(frozen ? sequence : ++sequence)},body:jpeg} : {status:503}));
  await page.goto('/display');
  const image=page.getByRole('img',{name:'Nikon Live View'});
  await expect(image).toBeVisible();const first=await image.getAttribute('src');
  await expect.poll(()=>image.getAttribute('src')).not.toBe(first);
  available=false;await expect(image).toHaveCount(0);
  await expect(page.getByText('Live View reconnecting…',{exact:true})).toBeVisible();
  available=true;await expect(image).toBeVisible();
  frozen=true;await expect(image).toHaveCount(0,{timeout:6000});
  frozen=false;await expect(image).toBeVisible();
  expect(commands).toBe(0);await expect(page.getByRole('button')).toHaveCount(0);
});

test('WebKit iPad display receives server countdown and active reset without operator controls',async({browser,page})=> {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/operator');await expect(page.getByText('Connected',{exact:true})).toBeVisible();
  const context=await browser.newContext({viewport:{width:1024,height:768},isMobile:true,hasTouch:true});
  const display=await context.newPage();display.on('pageerror',error=>errors.push(error.message));
  await display.goto('/display');await expect(display.getByText('Connected',{exact:true})).toBeVisible();
  await expect(display.getByRole('button')).toHaveCount(0);
  await page.getByRole('button',{name:'Start Session'}).click();
  await expect(display.locator('.countdown')).toHaveText('10');
  await expect(display.getByRole('heading',{name:'Photo 1 of 4'})).toBeVisible();
  await display.reload();await expect(display.locator('.countdown')).toBeVisible();
  await page.getByRole('button',{name:'Reset / Retake'}).click();
  await expect(page.locator('.status-row h2')).toHaveText('IDLE');
  await expect(display.getByRole('heading',{name:'Get Ready'})).toBeVisible();
  await expect(display.locator('.countdown')).toHaveCount(0);
  expect(await display.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);await context.close();
});
