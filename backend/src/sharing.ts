import express from 'express';
import {createServer} from 'node:http';
import QRCode from 'qrcode';
import type {SessionState} from '@photobooth/shared';
import {FileSessionStorage} from './storage.js';

export function shareOrigin(value?:string) {
  if(!value) return undefined;
  const url=new URL(value);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:' && !(local && url.protocol==='http:')) || url.username || url.password || url.search || url.hash || url.pathname!=='/') throw new Error('PUBLIC_SHARE_ORIGIN must be a public HTTPS origin (localhost HTTP is allowed for tests)');
  return url.origin;
}
export function shareInfo(state:SessionState,origin?:string):SessionState['share'] {
  const pagePath=state.output?.sharePath;
  if(!origin || state.status!=='COMPLETE' || !pagePath || !/^\/s\/[A-Za-z0-9_-]{32}$/.test(pagePath)) return undefined;
  return {url:new URL(pagePath,origin).href,qrImagePath:`${pagePath}/qr.svg`};
}

function photoPage(token:string,id:string) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Ảnh của bạn · CAP Photobooth</title><style>
  :root{color-scheme:light;font-family:system-ui,sans-serif;color:#193b33;background:#f3f5ee}*{box-sizing:border-box}body{margin:0;padding:24px max(20px,env(safe-area-inset-right)) 32px max(20px,env(safe-area-inset-left));text-align:center}main{max-width:620px;margin:auto}header{padding:12px 0 24px}strong{font-size:30px;letter-spacing:-1px}h1{font-size:24px;margin:12px 0 8px}p{font-size:16px;line-height:1.6;margin:8px 0 20px}img{display:block;max-width:100%;width:auto;max-height:70dvh;object-fit:contain;margin:auto;box-shadow:0 8px 28px #193b3326}a{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:12px 28px;margin:24px 0 8px;border-radius:12px;background:#193b33;color:#fff;font-size:18px;font-weight:650;text-decoration:none}a:focus-visible{outline:3px solid #64813b;outline-offset:4px}.note{font-size:14px;color:#52645c}footer{font-size:12px;margin-top:24px;color:#52645c}</style></head><body><main><header><strong>CAP</strong><h1>Ảnh của bạn đã sẵn sàng</h1><p>Lưu lại khoảnh khắc của bạn.</p></header><img src="/s/${token}/image.jpg" alt="Bốn ảnh của bạn trong khung CAP"><a href="/s/${token}/download" download="CAP-${id}.jpg">Tải ảnh JPG</a><p class="note">Trên iPhone, bạn cũng có thể nhấn giữ ảnh và chọn Lưu vào Ảnh.</p><footer>CAP PHOTOBOOTH · ${id.slice(0,8)}</footer></main></body></html>`;
}

export function createShareRouter(storage:FileSessionStorage,origin?:string) {
  const router=express.Router();
  router.use((_req,res,next)=> {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');next();
  });
  router.get('/:token/qr.svg',async(req,res)=> {
    try {
      if(!origin) {res.sendStatus(503);return;}
      await storage.readSharedJpeg(req.params.token);
      const svg=await QRCode.toString(`${origin}/s/${req.params.token}`,{type:'svg',errorCorrectionLevel:'M',margin:4,width:320,color:{dark:'#000000',light:'#ffffff'}});
      res.type('image/svg+xml').send(svg);
    } catch {res.status(404).send('Photo link not found');}
  });
  router.get('/:token/image.jpg',async(req,res)=> {
    try {const {jpeg}=await storage.readSharedJpeg(req.params.token);res.type('jpeg').send(jpeg);}
    catch {res.status(404).send('Photo link not found');}
  });
  router.get('/:token/download',async(req,res)=> {
    try {const {sessionId,jpeg}=await storage.readSharedJpeg(req.params.token);res.attachment(`CAP-${sessionId}.jpg`).type('jpeg').send(jpeg);}
    catch {res.status(404).send('Photo link not found');}
  });
  router.get('/:token',async(req,res)=> {
    try {
      const {sessionId}=await storage.readSharedJpeg(req.params.token);
      res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      res.type('html').send(photoPage(req.params.token,sessionId));
    } catch {res.status(404).send('Photo link not found');}
  });
  return router;
}

/** This public listener has no operator bootstrap, WebSockets, SDK or original-image routes. */
export function createPublicShareServer(storage:FileSessionStorage,origin:string) {
  const app=express();app.disable('x-powered-by');
  app.use('/s',createShareRouter(storage,origin));
  app.use((_req,res)=>res.status(404).type('text').send('Photo link not found'));
  return createServer(app);
}
