import { test, expect } from '@playwright/test';
import sharp from 'sharp';

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
