import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';

const directory=path.resolve(process.argv[2] ?? '.');
const node=path.join(directory,'runtime/node.exe');
const child=spawn(node,[path.join(directory,'tools/event-runner.mjs'),'mock'],{cwd:directory,env:{...process.env,CAP_NO_BROWSER:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let logs='';child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let instance,ws;
try {
  for(let attempt=0;attempt<120;attempt++) {
    if(child.exitCode!==null) throw new Error(`Portable launcher exited (${child.exitCode}): ${logs}`);
    try {
      instance=JSON.parse(await readFile(path.join(directory,'.local/event-instance.json'),'utf8'));
      if((await fetch(`http://127.0.0.1:${instance.port}/health`)).ok) break;
    } catch {}
    await pause(250);
  }
  assert.ok(instance,'Portable app did not start');
  const origin=`http://localhost:${instance.port}`;
  assert.match(await (await fetch(origin+'/operator')).text(),/<div id="root">/);
  assert.equal((await fetch(origin+'/internal/operator-token')).status,404);
  const health=await (await fetch(origin+'/health')).json();assert.equal(health.mode,'MOCK');
  const bootstrap=await fetch(origin+'/operator-api/bootstrap');assert.equal(bootstrap.status,200);
  const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
  let started=false,state;
  await new Promise((resolve,reject)=> {
    const timeout=setTimeout(()=>reject(new Error('Portable four-photo mock session timed out')),65000);
    ws=new WebSocket(`ws://localhost:${instance.port}/ws?role=operator`,{origin,headers:{cookie}});
    ws.on('error',reject);
    ws.on('message',raw=> {
      const event=JSON.parse(raw);
      if(event.type!=='STATE') return;
      state=event.state;
      if(!started && state.status==='IDLE') {started=true;ws.send(JSON.stringify({type:'START',requestId:'portable-smoke'}));}
      if(state.status==='ERROR') {clearTimeout(timeout);reject(new Error(state.error));}
      if(state.status==='COMPLETE' && !state.busy) {clearTimeout(timeout);resolve();}
    });
  });
  assert.equal(state.captures.length,4);assert.ok(state.captures.every(photo=>photo.status==='saved'));
  const image=await fetch(origin+state.output.jpgUrl,{headers:{cookie}});assert.equal(image.status,200);
  const bytes=Buffer.from(await image.arrayBuffer());assert.equal(bytes[0],255);assert.equal(bytes[1],216);
  console.log(`Portable MOCK acceptance passed: built frontend, operator auth, proxied WebSocket, four full countdowns, four saved captures, final JPG ${bytes.length} bytes. No real camera commands.`);
} finally {
  ws?.terminate();
  if(instance) {
    const response=await fetch(`http://127.0.0.1:${instance.port}/event-control/stop`,{method:'POST',headers:{'x-cap-stop-token':instance.token}}).catch(()=>null);
    if(response) await response.text();
  }
  for(let attempt=0;attempt<120 && child.exitCode===null;attempt++) await pause(250);
  if(child.exitCode===null) {console.error(logs);throw new Error('Portable safe shutdown did not finish; process was not force-killed');}
  assert.equal(child.exitCode,0,logs);console.log('Portable safe shutdown passed.');
}
