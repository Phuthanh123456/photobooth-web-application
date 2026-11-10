import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {WebSocket} from 'ws';

const root=fileURLToPath(new URL('../../',import.meta.url));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port() {
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const selected=server.address().port;await new Promise(resolve=>server.close(resolve));return selected;
}
test('portable launcher boots built operator, proxy, frame and WebSocket, then shuts down without camera commands', {timeout:45000},async()=> {
  const fixture=await mkdtemp(path.join(os.tmpdir(),'cap-start-'));
  let child,exit,output='';
  try {
    for(const name of ['backend/src','shared/src','shared/package.json','assets/templates','frontend/dist','tools/event-runner.mjs','tools/event-gateway.mjs','package.json']) {
      const target=path.join(fixture,name);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(root,name),target,{recursive:true});
    }
    await symlink(path.join(root,'node_modules'),path.join(fixture,'node_modules'),process.platform==='win32' ? 'junction' : 'dir');
    const frontendPort=await port(),backendPort=await port(),sharePort=await port();
    await mkdir(path.join(fixture,'.local'));
    await writeFile(path.join(fixture,'.local/event-config.json'),JSON.stringify({frontendPort,backendPort,sharePort,sharing:'offline'}));
    child=spawn(process.execPath,['tools/event-runner.mjs','mock'],{cwd:fixture,env:{...process.env,CAP_NO_BROWSER:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    exit=once(child,'exit');
    child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
    const url=`http://127.0.0.1:${frontendPort}`;
    let ready=false;
    for(let i=0;i<100;i++) {
      if(child.exitCode!==null) throw new Error(output);
      try {ready=(await fetch(`${url}/health`,{signal:AbortSignal.timeout(300)})).ok;} catch {}
      if(ready) break;await pause(100);
    }
    assert.ok(ready,output);
    const health=await (await fetch(`${url}/health`)).json();assert.equal(health.mode,'MOCK');
    const bootstrap=await fetch(`${url}/operator-api/bootstrap`);assert.equal(bootstrap.status,200);
    assert.match(bootstrap.headers.get('set-cookie'),/photobooth_operator=/);
    assert.equal((await fetch(`${url}/templates/page-1.png`)).status,200);
    const ws=new WebSocket(`ws://127.0.0.1:${frontendPort}/ws?role=operator`,{origin:url,headers:{cookie:bootstrap.headers.get('set-cookie').split(';')[0]}});
    const [raw]=await once(ws,'message');const state=JSON.parse(raw);assert.equal(state.type,'STATE');assert.equal(state.state.status,'IDLE');assert.equal(state.state.camera,'mock');ws.terminate();
    const record=JSON.parse(await readFile(path.join(fixture,'.local/event-instance.json'),'utf8'));
    assert.equal((await fetch(`${url}/event-control/stop`,{method:'POST',headers:{'x-cap-stop-token':record.token}})).status,200);
    const [code]=await exit;assert.equal(code,0,output);child=undefined;
    const log=await readFile(path.join(fixture,'.local/event-backend.log'),'utf8');assert.doesNotMatch(log,/shutdown failed|No active session to cancel/);
  } finally {
    if(child && child.exitCode===null) {child.kill('SIGTERM');await exit;}
    assert.ok(fixture.startsWith(path.join(os.tmpdir(),'cap-start-')));await rm(fixture,{recursive:true,force:true});
  }
});
