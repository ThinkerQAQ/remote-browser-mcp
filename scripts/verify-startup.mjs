// Opt-in real Windows Task Scheduler acceptance, isolated from installed data.
// Run: node scripts/verify-startup.mjs. Requires permission to manage own tasks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

if(process.platform!=='win32') throw Error('This acceptance checks Windows Task Scheduler; use native platform CI for Unix');
const source=fileURLToPath(new URL('../',import.meta.url));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"rb-startup acceptance's ")));
const bin=path.join(root,'bin'); fs.mkdirSync(bin); fs.mkdirSync(path.join(root,'scripts'));
const client=path.join(bin,'remotebrowsermcp.exe');
const task='RemoteBrowserMCP-'+crypto.createHash('sha256').update(root).digest('hex').slice(0,10)+'-Login';
const env={...process.env,GOCACHE:process.env.GOCACHE||path.join(os.tmpdir(),'remote-browser-startup-go-cache')};
for(const key of Object.keys(env)) if(key.toLowerCase()==='psmodulepath') delete env[key];
const run=(file,args,options={})=>execFileSync(file,args,{env,windowsHide:true,encoding:'utf8',timeout:60000,...options});
const cli=(...args)=>run(client,args);
const ps=script=>run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; "+script]);
const state=()=>JSON.parse(cli('status'));
async function until(check){for(let n=0;n<30;n++){if(check())return;await delay(300);}throw Error('Acceptance timed out');}
let configured=false;
try {
  run('go',['build','-o',client,'.'],{cwd:path.join(source,'client')});
  run('go',['build','-o',path.join(bin,'tunnel-client.exe'),path.join(source,'tests/fixtures/tunnel.go')]);
  fs.copyFileSync(process.execPath,path.join(bin,'node.exe'));
  for(const file of ['launch.mjs','runtime.mjs','private-files.mjs','entrypoint.mjs']) fs.copyFileSync(path.join(source,'scripts',file),path.join(root,'scripts',file));
  run(client,['configure','--id','tunnel_ACCEPTANCE','--api-key-stdin','--autostart=true','--auto-connect=false'],{input:'synthetic-startup-key\n'}); configured=true;
  assert.equal(state().autostart_enabled,true); assert.equal(state().managed_process_running,false);
  const taskInfo=JSON.parse(ps(`$t=Get-ScheduledTask -TaskName '${task}'; @{logon=[string]$t.Principal.LogonType;level=[string]$t.Principal.RunLevel;limit=[string]$t.Settings.ExecutionTimeLimit} | ConvertTo-Json -Compress`));
  assert.equal(taskInfo.logon,'Interactive'); assert.equal(taskInfo.level,'Limited'); assert.equal(taskInfo.limit,'PT0S');
  ps(`Start-ScheduledTask -TaskName '${task}'`);
  await until(()=>state().managed_process_running);
  assert.equal(state().tunnel_connecting,false); assert.equal(state().tunnel_ready,false);
  cli('connect'); await until(()=>state().tunnel_ready);
  cli('disconnect'); assert.equal(state().managed_process_running,true); assert.equal(state().tunnel_ready,false);
  cli('configure','--id','tunnel_ACCEPTANCE','--auto-connect=true');
  assert.equal(state().restart_required,true);
  cli('restart'); await until(()=>state().tunnel_ready);
  cli('stop'); assert.equal(state().managed_process_running,false); assert.equal(state().autostart_enabled,true);
  // Start the actual registered action again to simulate its next logon trigger.
  ps(`Start-ScheduledTask -TaskName '${task}'`); await until(()=>state().tunnel_ready);
  cli('configure','--id','tunnel_ACCEPTANCE','--autostart=false');
  assert.equal(state().autostart_enabled,false); assert.equal(state().managed_process_running,true);
  cli('stop');
  const files=['runtime/setup.json','runtime/credentials.json','config.toml'];
  const snapshots=files.map(file=>fs.readFileSync(path.join(root,file)));
  cli('configure','--id','tunnel_ACCEPTANCE');
  for(let n=0;n<files.length;n++) assert.deepEqual(fs.readFileSync(path.join(root,files[n])),snapshots[n],'unchanged saves retain credentials and preferences');
  assert.equal(state().id,'tunnel_ACCEPTANCE'); assert.equal(state().tunnel_auto_connect,true);
  console.log('WINDOWS_LOGIN_TASK_ACCEPTANCE_PASS: register, task launch, standby, connect, disconnect, restart, stop, relaunch, disable, preserve configuration');
} finally {
  if(configured) { try{cli('stop');}catch{} }
  try{ps(`$t=Get-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue; if($t){$t | Unregister-ScheduledTask -Confirm:$false}`);}catch{}
  assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));
  fs.rmSync(root,{recursive:true,force:true});
}
