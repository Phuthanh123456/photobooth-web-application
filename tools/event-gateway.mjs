import {createServer,request as httpRequest} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {WebSocket,WebSocketServer} from 'ws';

const local=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address ?? '');
const safeEqual=(a,b)=> {
  if(typeof a!=='string') return false;
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
};
const allowed=/^\/(?:health$|ws$|media\/|templates\/|images\/|live-view\.(?:jpg|mjpg)$|s\/)/;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};

/** Production static frontend + constrained proxy. The camera backend stays loopback-only. */
export function createEventGateway({backendPort,frontendDirectory,stopToken,onStop}) {
  const backend=`http://127.0.0.1:${backendPort}`,root=path.resolve(frontendDirectory);
  const sockets=new Set();
  let operatorCookie;
  const server=createServer(async(req,res)=> {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/event-control/')) {
      if(!local(req.socket.remoteAddress) || !safeEqual(req.headers['x-cap-stop-token'],stopToken) || req.headers.origin) {res.writeHead(403).end();return;}
      if(url.pathname==='/event-control/status' && req.method==='GET') {res.setHeader('Cache-Control','no-store');res.end('CAP_EVENT_RUNNING');return;}
      if(url.pathname==='/event-control/stop' && req.method==='POST') {res.end('Stopping safely; waiting for camera and saves.');void onStop();return;}
      res.writeHead(404).end();return;
    }
    if(url.pathname==='/operator-api/bootstrap') {
      if(!local(req.socket.remoteAddress) || req.method!=='GET' || req.headers['sec-fetch-site']==='cross-site') {res.writeHead(403).end();return;}
      try {
        const reply=await fetch(`${backend}/internal/operator-token`,{signal:AbortSignal.timeout(3000)});
        const {token}=await reply.json();
        if(!reply.ok || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Backend unavailable');
        operatorCookie=`photobooth_operator=${token}`;
        res.setHeader('Set-Cookie',`${operatorCookie}; HttpOnly; SameSite=Strict; Path=/`);
        res.setHeader('Cache-Control','no-store');res.end('OK');
      } catch {res.writeHead(503).end('Backend unavailable');}
      return;
    }
    if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
    if(allowed.test(url.pathname)) {
      const headers={...req.headers,host:`127.0.0.1:${backendPort}`};
      // Even a copied operator cookie cannot grant LAN clients original-photo access.
      if(!local(req.socket.remoteAddress)) delete headers.cookie;
      const upstream=httpRequest(backend+req.url,{method:req.method,headers},reply=>{res.writeHead(reply.statusCode ?? 502,reply.headers);reply.pipe(res);});
      upstream.on('error',()=>{if(!res.headersSent) res.writeHead(502);res.end();});
      res.on('close',()=>upstream.destroy());upstream.end();return;
    }
    let file;
    try {
      const route=decodeURIComponent(url.pathname);
      if(['/', '/operator','/display'].includes(route)) file=path.join(root,'index.html');
      else {
        if(!route.startsWith('/assets/') || route.includes('\\') || route.includes('\0')) throw new Error();
        file=path.resolve(root,'.'+route);
        if(!file.startsWith(root+path.sep) || !(await stat(file)).isFile()) throw new Error();
      }
      res.setHeader('Content-Type',mime[path.extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control',file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.end(req.method==='HEAD' ? undefined : await readFile(file));
    } catch {res.writeHead(404).end('Not found');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4096});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.on('upgrade',(req,socket,head)=> {
    const url=new URL(req.url,'http://localhost');
    const isOperator=url.searchParams.get('role')==='operator';
    let originLocal=false;
    try {originLocal=['localhost','127.0.0.1','[::1]'].includes(new URL(req.headers.origin).hostname);} catch {}
    const hasCookie=req.headers.cookie?.split(';').some(value=>value.trim()===operatorCookie);
    if(url.pathname!=='/ws' || (isOperator && (!local(req.socket.remoteAddress) || !originLocal || !hasCookie))) {socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,downstream=> {
      const upstream=new WebSocket(`ws://127.0.0.1:${backendPort}${req.url}`,{origin:req.headers.origin,headers:isOperator ? {cookie:operatorCookie} : {}});
      const pending=[];
      downstream.on('message',(data,isBinary)=> {
        if(upstream.readyState===WebSocket.OPEN) upstream.send(data,{binary:isBinary});
        else if(pending.length<8) pending.push([data,isBinary]);else downstream.terminate();
      });
      upstream.on('open',()=>{for(const [data,binary] of pending) upstream.send(data,{binary});pending.length=0;});
      upstream.on('message',(data,isBinary)=>{if(downstream.readyState===WebSocket.OPEN && downstream.bufferedAmount<1024*1024) downstream.send(data,{binary:isBinary});else downstream.terminate();});
      downstream.on('close',()=>upstream.terminate());downstream.on('error',()=>upstream.terminate());
      upstream.on('close',()=>downstream.close());upstream.on('error',()=>downstream.close());
    });
  });
  return {server,close:async()=> {
    for(const client of wss.clients) client.terminate();
    for(const socket of sockets) socket.destroy();
    wss.close();await new Promise(resolve=>server.close(resolve));
  }};
}
