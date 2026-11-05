// Native Windows HKCU Run acceptance with synthetic credentials.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync,spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';
if(process.platform!=='win32')throw Error('Windows-only');
const source=fileURLToPath(new URL('../',import.meta.url));
const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"rb-startup acceptance's ")));
const bin=path.join(root,'bin');fs.mkdirSync(bin);fs.mkdirSync(path.join(root,'scripts'));
const client=path.join(bin,'remotebrowsermcp.exe');
const label='RemoteBrowserMCP-'+crypto.createHash('sha256').update(root).digest('hex').slice(0,10)+'-Login';
const runKey='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const env={...process.env,GOCACHE:process.env.GOCACHE||path.join(os.tmpdir(),'remote-browser-startup-go-cache')};
const run=(file,args,options={})=>execFileSync(file,args,{env,windowsHide:true,encoding:'utf8',timeout:90000,...options});
const cli=(...args)=>run(client,args);const state=()=>JSON.parse(cli('status'));
async function until(check){for(let n=0;n<75;n++){if(check())return;await delay(300);}throw Error('Native acceptance timed out');}
let configured=false;
try{
 run('go',['build','-o',client,'.'],{cwd:path.join(source,'client')});
 run('go',['build','-o',path.join(bin,'tunnel-client.exe'),path.join(source,'tests/fixtures/tunnel.go')]);
 fs.copyFileSync(process.execPath,path.join(bin,'node.exe'));
 for(const file of ['launch.mjs','runtime.mjs','private-files.mjs','entrypoint.mjs'])fs.copyFileSync(path.join(source,'scripts',file),path.join(root,'scripts',file));
 run(client,['configure','--id','tunnel_ACCEPTANCE','--api-key-stdin','--autostart=true','--auto-connect=false'],{input:'synthetic-startup-key\n'});configured=true;
 assert.equal(state().autostart_enabled,true);assert.equal(state().managed_process_running,false);
 const record=run('reg.exe',['query',runKey,'/v',label]).split(/\r?\n/).find(x=>x.includes(label)&&x.includes('REG_SZ'));
 assert.ok(record);assert.equal(record.split('REG_SZ')[1].trim(),'"'+client+'" serve-worker');
 const launch=()=>{const child=spawn(client,['serve-worker'],{cwd:root,env,detached:true,windowsHide:true,stdio:'ignore'});child.unref();};
 launch();await until(()=>state().managed_process_running);
 assert.equal(state().tunnel_connecting,false);
 cli('connect');await until(()=>state().tunnel_ready);
 cli('disconnect');assert.equal(state().managed_process_running,true);
 cli('configure','--id','tunnel_ACCEPTANCE','--auto-connect=true');assert.equal(state().restart_required,true);
 cli('restart');await until(()=>state().tunnel_ready);
 cli('stop');assert.equal(state().managed_process_running,false);assert.equal(state().autostart_enabled,true);
 launch();await until(()=>state().tunnel_ready);
 cli('configure','--id','tunnel_ACCEPTANCE','--autostart=false');assert.equal(state().autostart_enabled,false);assert.equal(state().managed_process_running,true);
 cli('stop');
 const files=['runtime/setup.json','runtime/credentials.json','config.toml'];const snapshots=files.map(f=>fs.readFileSync(path.join(root,f)));
 cli('configure','--id','tunnel_ACCEPTANCE');for(let n=0;n<files.length;n++)assert.deepEqual(fs.readFileSync(path.join(root,files[n])),snapshots[n]);
 console.log('WINDOWS_NATIVE_LOGIN_ACCEPTANCE_PASS');
}finally{
 if(configured)try{cli('stop')}catch{}
 try{const output=run('reg.exe',['query',runKey,'/v',label]);if(output.includes('"'+client+'" serve-worker'))run('reg.exe',['delete',runKey,'/v',label,'/f']);}catch{}
 assert.equal(path.dirname(root),fs.realpathSync.native(os.tmpdir()));
 fs.rmSync(root,{recursive:true,force:true});
}
