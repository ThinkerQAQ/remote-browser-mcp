import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

// A synthetic Tunnel worker exercises lifecycle without a browser or OpenAI.
test('Go-compatible worker authenticates control, owns its label and passes key only in environment', {timeout:30000}, async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'browser-client-'));
 fs.mkdirSync(path.join(root,'scripts')); fs.mkdirSync(path.join(root,'runtime'),{mode:0o700});
 for (const file of ['runtime.mjs','private-files.mjs','entrypoint.mjs']) fs.copyFileSync(new URL('../scripts/'+file,import.meta.url),path.join(root,'scripts',file));
 const secret='synthetic-runtime-key';
 const fake=path.join(root,'fake.mjs');
 fs.writeFileSync(fake, `if(process.env.OPENAI_API_KEY!==${JSON.stringify(secret)}) process.exit(2); setInterval(()=>{},1000);`);
 fs.writeFileSync(path.join(root,'runtime/setup.json'),JSON.stringify({tunnel:process.execPath,tunnelArgs:[fake]}));
 fs.writeFileSync(path.join(root,'runtime/credentials.json'),JSON.stringify({apiKey:secret}),{mode:0o600});
 const worker=spawn(process.execPath,[path.join(root,'scripts/runtime.mjs'),'run'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const exited=once(worker,'exit'); let output=''; worker.stdout.on('data',b=>output+=b); worker.stderr.on('data',b=>output+=b);
 try {
  let control;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) {
   try { control=JSON.parse(fs.readFileSync(path.join(root,'runtime/control.json'),'utf8')); break; } catch {}
   if(worker.exitCode!==null) throw Error('worker exited: '+output);
   await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(control,'control endpoint missing');
  const url=`http://127.0.0.1:${control.port}`;
  assert.equal((await fetch(url+'/stop',{method:'POST'})).status,403);
  const headers={Authorization:'Bearer '+control.token};
  const response=await fetch(url+'/status',{headers});
  assert.equal(response.status,200);
  assert.equal((await response.json()).label,'remote-browser-mcp-'+crypto.createHash('sha256').update(root).digest('hex').slice(0,10));
  assert.equal((await fetch(url+'/stop',{method:'POST',headers})).status,200);
  const [code]=await exited; assert.equal(code,0);
  assert.ok(!output.includes(secret));
  assert.ok(!fs.readFileSync(path.join(root,'runtime/tunnel.log'),'utf8').includes(secret));
 } finally { if(worker.exitCode===null) worker.kill(); await exited; fs.rmSync(root,{recursive:true,force:true}); }
});
