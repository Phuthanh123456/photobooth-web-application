import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WebSocket,WebSocketServer} from 'ws';
import {createEventGateway} from '../event-gateway.mjs';

test('production gateway serves built UI, preserves operator auth, proxies WS, and isolates internals',async()=> {
  const root=await mkdtemp(path.join(os.tmpdir(),'cap-gateway-'));
  await writeFile(path.join(root,'index.html'),'<title>CAP static UI</title>');await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'assets/app.js'),'console.log("CAP");');
  const token='a'.repeat(64),cookie=`photobooth_operator=${token}`;
  const backend=createServer((req,res)=> {
    if(req.url==='/internal/operator-token') res.end(JSON.stringify({token}));
    else if(req.url==='/health') res.end(JSON.stringify({ok:true}));
    else res.writeHead(404).end();
  });
  const wss=new WebSocketServer({server:backend});
  wss.on('connection',(ws,req)=>{ws.send(JSON.stringify({type:'STATE',operator:req.headers.cookie===cookie}));ws.on('message',data=>ws.send(data));});
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  let stopped=false;
  const gateway=createEventGateway({backendPort:backend.address().port,frontendDirectory:root,stopToken:'secret',onStop:async()=>{stopped=true;}});
  gateway.server.listen(0,'0.0.0.0');await once(gateway.server,'listening');
  const port=gateway.server.address().port,url=`http://127.0.0.1:${port}`;
  try {
    for(const route of ['/operator','/display']) assert.match(await (await fetch(url+route)).text(),/CAP static UI/);
    for(const route of ['/internal/operator-token','/.local/cloud-config.json','/backend/src/index.ts','/assets/%2e%2e%5csecret']) assert.equal((await fetch(url+route)).status,404);
    assert.equal((await fetch(url+'/health')).status,200);
    const bootstrap=await fetch(url+'/operator-api/bootstrap');assert.equal(bootstrap.status,200);assert.match(bootstrap.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    assert.equal((await fetch(url+'/operator-api/bootstrap',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws?role=operator`,{origin:`http://localhost:${port}`,headers:{cookie}});
    const [state]=await once(ws,'message');assert.equal(JSON.parse(state).operator,true);
    ws.send('command');const [echo]=await once(ws,'message');assert.equal(echo.toString(),'command');ws.terminate();
    const display=new WebSocket(`ws://127.0.0.1:${port}/ws?role=display`,{origin:`http://localhost:${port}`,headers:{cookie}});
    const [displayState]=await once(display,'message');assert.equal(JSON.parse(displayState).operator,false);display.terminate();
    const ip=Object.values(os.networkInterfaces()).flat().find(item=>item.family==='IPv4' && !item.internal)?.address;
    if(ip) {
      assert.equal((await fetch(`http://${ip}:${port}/operator-api/bootstrap`)).status,403);
      const denied=new WebSocket(`ws://${ip}:${port}/ws?role=operator`,{origin:`http://localhost:${port}`,headers:{cookie}});
      await new Promise(resolve=>{denied.on('error',error=>{assert.match(error.message,/403/);resolve();});});
      assert.equal((await fetch(`http://${ip}:${port}/event-control/status`,{headers:{'x-cap-stop-token':'secret'}})).status,403);
    }
    assert.equal((await fetch(url+'/event-control/stop',{method:'POST'})).status,403);assert.equal(stopped,false);
    assert.equal((await fetch(url+'/event-control/stop',{method:'POST',headers:{'x-cap-stop-token':'éééééé'}})).status,403);
    assert.equal((await fetch(url+'/event-control/stop',{method:'POST',headers:{'x-cap-stop-token':'secret'}})).status,200);assert.equal(stopped,true);
  } finally {
    await gateway.close();for(const ws of wss.clients) ws.terminate();wss.close();backend.closeAllConnections();await new Promise(resolve=>backend.close(resolve));await rm(root,{recursive:true,force:true});
  }
});
