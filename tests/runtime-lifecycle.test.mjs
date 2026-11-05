import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

async function until(check) {
  for (let n=0;n<150;n++) { const result=await check(); if(result) return result; await delay(100); }
  throw Error('Timed out waiting for isolated worker');
}
for (const auto of [false, undefined]) test(`worker separates local lifecycle and Tunnel connection (auto=${auto})`, {timeout:45000}, async t => {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'rb-lifecycle-')));
  fs.mkdirSync(path.join(root,'scripts')); fs.mkdirSync(path.join(root,'runtime'));
  for(const file of ['runtime.mjs','entrypoint.mjs','private-files.mjs']) fs.copyFileSync(new URL('../scripts/'+file,import.meta.url),path.join(root,'scripts',file));
  const marker=path.join(root,'connected');
  fs.writeFileSync(path.join(root,'stub.mjs'),`import fs from 'node:fs'; if(process.env.OPENAI_API_KEY!=='synthetic-key') process.exit(2); fs.writeFileSync(${JSON.stringify(marker)},'connected'); setInterval(()=>{},1000);`);
  const setup={id:'tunnel_SYNTHETIC',revision:'saved-revision',tunnel:process.execPath,tunnelArgs:[path.join(root,'stub.mjs')],tunnel_auto_connect:auto};
  const setupFile=path.join(root,'runtime/setup.json'); fs.writeFileSync(setupFile,JSON.stringify(setup));
  fs.writeFileSync(path.join(root,'runtime/credentials.json'),JSON.stringify({apiKey:'synthetic-key'}));
  const env={...process.env}; // In Windows tests, use the native Go ACL helper.
  const child=spawn(process.execPath,[path.join(root,'scripts/runtime.mjs'),'run'],{env,windowsHide:true,stdio:'ignore'});
  let control;
  const request=async(action,auth=true)=>{
    const response=await fetch(`http://127.0.0.1:${control.port}/${action}`,{method:action==='status'?'GET':'POST',headers:{Authorization:auth?'Bearer '+control.token:'invalid'},signal:AbortSignal.timeout(6000)});
    return {response,data:response.ok?await response.json():null};
  };
  t.after(async()=>{
    if(child.exitCode===null) { try{await request('stop');}catch{} }
    await until(()=>child.exitCode!==null).catch(()=>child.kill());
    assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));
    fs.rmSync(root,{recursive:true,force:true});
  });
  await until(()=>{try{control=JSON.parse(fs.readFileSync(path.join(root,'runtime/control.json')));return true;}catch{return false;}});
  assert.equal((await request('status',false)).response.status,403);
  let status=(await request('status')).data;
  assert.equal(status.revision,'saved-revision'); assert.equal(status.connecting,auto!==false);
  if(auto===false) { await delay(300); assert.equal(fs.existsSync(marker),false); }
  else await until(()=>fs.existsSync(marker));
  assert.equal((await request('connect')).response.status,200);
  await until(()=>fs.existsSync(marker));
  assert.equal((await request('disconnect')).response.status,200);
  status=(await request('status')).data; assert.equal(status.connecting,false); assert.equal(child.exitCode,null);
  assert.equal(fs.readFileSync(setupFile,'utf8'),JSON.stringify(setup),'manual disconnect must not rewrite preferences');
  fs.writeFileSync(path.join(root,'runtime/credentials.json'),JSON.stringify({apiKey:'replacement-pending-restart'}));
  fs.unlinkSync(marker);
  assert.equal((await request('connect')).response.status,200);
  await until(()=>fs.existsSync(marker)); // Saved replacement key applies only after Restart.
  assert.equal((await request('stop')).response.status,200);
  await until(()=>child.exitCode!==null); assert.equal(child.exitCode,0);
});
