import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {browserProfile, browserPortPath} from '../scripts/lib/browser-profile.mjs';
import {stateDirectory, storeCredential, loadCredential, startupPlan, loadConfig, run} from '../scripts/lib/unix-setup.mjs';
import {configure} from '../scripts/setup-unix.mjs';

test('browser profiles resolve native Linux/macOS/Windows paths and custom profiles', () => {
  assert.equal(browserProfile({platform:'linux',home:'/home/example',env:{XDG_CONFIG_HOME:'/custom'},browser:'edge'}), '/custom/microsoft-edge');
  assert.equal(browserProfile({platform:'darwin',home:'/Users/example',browser:'chrome'}), '/Users/example/Library/Application Support/Google/Chrome');
  assert.equal(browserPortPath({platform:'win32',home:'C:\\Users\\Example',env:{LOCALAPPDATA:'C:\\Local'},browser:'chrome'}), 'C:\\Local\\Google\\Chrome\\User Data\\DevToolsActivePort');
  assert.equal(browserProfile({platform:'linux',userDataDir:'/private/profile',browser:'chrome'}), '/private/profile');
  assert.equal(stateDirectory('linux','/home/example',{XDG_STATE_HOME:'/state'}), '/state/remote-browser-mcp');
});
test('encrypted fallback protects credentials and rejects wrong passphrase or tampering', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(),'unix-secret-'));
  const options = {backend:'encrypted-file',root:state,state,passphrase:'fixture-long-passphrase'};
  try {
    await storeCredential({...options,key:'fixture-runtime-secret'});
    const file = path.join(state,'runtime-key.enc.json');
    assert.equal(fs.readFileSync(file,'utf8').includes('fixture-runtime-secret'), false);
    assert.equal(await loadCredential(options),'fixture-runtime-secret');
    await assert.rejects(loadCredential({...options,passphrase:'wrong'}));
    const saved=JSON.parse(fs.readFileSync(file));saved.tag='00'.repeat(16);fs.writeFileSync(file,JSON.stringify(saved));
    await assert.rejects(loadCredential(options));
    if(process.platform!=='win32') assert.equal(fs.statSync(file).mode & 0o777,0o600);
  } finally {fs.rmSync(state,{recursive:true,force:true});}
});
test('OS key-store writes put the secret on stdin rather than argv', async () => {
  const calls=[];const key='fixture-runtime-secret';
  const runner=async(file,args,options={})=>{calls.push({file,args,options});return {code:0,stdout:args[0]==='find-generic-password'?key+'\n':'',stderr:''};};
  await storeCredential({backend:'keychain',key,root:'/tmp/test',state:'/tmp/test',runner});
  await storeCredential({backend:'secret-service',key,root:'/tmp/test',state:'/tmp/test',runner});
  assert.equal(calls.some(c=>c.args.join(' ').includes(key)),false);
  assert.equal(calls[0].options.input.includes(key),true);
  assert.equal(calls.at(-1).options.input,key);
});
test('login startup quotes paths correctly and never enables unattended passphrase unlock', () => {
  const setup={node_path:'/opt/Node Tools/node',secret_backend:'keychain'};
  const mac=startupPlan('darwin','/Users/example/project & tools',setup,'/Users/example');
  assert.equal(mac.content.includes('project &amp; tools'),true);
  assert.equal(mac.content.includes('<key>RunAtLoad</key><true/>'),true);
  const linux=startupPlan('linux','/home/example/project % test',setup,'/home/example');
  assert.equal(linux.content.includes('project %% test'),true);
  assert.throws(()=>startupPlan('linux','/tmp/test',{...setup,secret_backend:'encrypted-file'}));
});
test('Unix wizard writes secure configuration, reports pending acceptance and reuses a healthy runtime', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"unix setup 中文 "));
  const state=path.join(root,'state');fs.mkdirSync(state);
  const client=path.join(root,'tunnel-client');fs.writeFileSync(client,'fixture');
  let connected=0,launched=0;const key='fixture-runtime-key';const transcript=[];
  const runner=async(file,args,options={})=>{
    if(args[0]==='runtimes'&&args[1]==='status')return {code:0,stdout:JSON.stringify({process_running:connected>0,healthy:connected>0,ready:connected>0,tunnel_id:'tunnel_'+'a'.repeat(32)}),stderr:''};
    if(args[0]==='runtimes'&&args[1]==='connect'){
      assert.equal(options.env.REMOTE_BROWSER_RUNTIME_KEY,key);assert.equal(args.join(' ').includes(key),false);
      connected++;fs.writeFileSync(path.join(state,'browser-health.json'),JSON.stringify({phase:'finished',cdp_ready:true}));return {code:0,stdout:'',stderr:''};
    }
    return {code:1,stdout:'',stderr:''};
  };
  const settings={root,state,platform:'linux',home:root,language:'en',runner,installClient:async()=>client,detectBrowser:async()=>({name:'chrome',binary:'/fake/chrome'}),open:async()=>{},output:value=>transcript.push(value),
    hidden:async label=>label.startsWith('Runtime')?key:'fixture-long-passphrase',
    ask:async(label,defaultValue)=>label==='Tunnel ID'?'tunnel_'+'a'.repeat(32):/Replace saved|ChatGPT test/.test(label)?'N':defaultValue,
    launchBrowser:async(binary,profile)=>{launched++;fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'9222\n/devtools/browser/fixture');}
  };
  try {
    assert.equal((await configure(settings)).pending,true);
    assert.equal((await configure(settings)).reused,true);
    assert.equal(connected,1);assert.equal(launched,1);
    const config=loadConfig(root);assert.equal(config.browser.name,'chrome');assert.equal(config.setup.native_alias,'remote-browser-unix');
    assert.equal(fs.readFileSync(path.join(root,'config.toml'),'utf8').includes(key),false);
    assert.equal(transcript.join('\n').includes(key),false);
    const report=JSON.parse(fs.readFileSync(path.join(state,'setup-report.json')));assert.equal(report.phase,'chatgpt_pending');assert.equal(report.chatgpt_user_confirmed,false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('macOS security interactive credential storage works with an isolated keychain', {skip:process.platform!=='darwin'}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-keychain-'));const keychain=path.join(dir,'fixture.keychain');
  try {
    const created=await run('/usr/bin/security',['create-keychain','-p','fixture-password',keychain]);assert.equal(created.code,0);
    assert.equal((await run('/usr/bin/security',['unlock-keychain','-p','fixture-password',keychain])).code,0);
    const runner=async(file,args,options={})=>{
      if(args[0]==='-i')return run(file,args,{...options,input:options.input.trimEnd()+' "'+keychain+'"\n'});
      return run(file,[...args,keychain],options);
    };
    await storeCredential({backend:'keychain',key:'fixture-keychain-secret',root:dir,state:dir,runner});
    assert.equal(await loadCredential({backend:'keychain',root:dir,state:dir,runner}),'fixture-keychain-secret');
  } finally {await run('/usr/bin/security',['delete-keychain',keychain]);fs.rmSync(dir,{recursive:true,force:true});}
});
test('shell bootstrap installs only a verified private Node archive and rejects corruption', {skip:process.platform==='win32'}, async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shell bootstrap 中文 '));
  try {
    const platform=process.platform==='darwin'?'darwin':'linux';const arch=process.arch==='arm64'?'arm64':'x64';
    const folder=`node-v24.0.0-${platform}-${arch}`;const payload=path.join(temp,'payload',folder,'bin');fs.mkdirSync(payload,{recursive:true});
    fs.writeFileSync(path.join(payload,'node'),'#!/bin/sh\ncase "$1" in */scripts/setup-unix.mjs) printf "PRIVATE_NODE_READY\\n";; esac\nexit 0\n',{mode:0o755});
    fs.writeFileSync(path.join(payload,'npm'),'#!/bin/sh\nexit 0\n',{mode:0o755});
    const archive=path.join(temp,folder+'.tar.gz');
    assert.equal(spawnSync('tar',['-czf',archive,'-C',path.join(temp,'payload'),folder]).status,0);
    const tools=path.join(temp,'tools');fs.mkdirSync(tools);
    for(const name of ['uname','mkdir','chmod','mktemp','rm','tar','awk','mv','dirname','gzip','sha256sum','shasum']) {
      const found=spawnSync('/bin/sh',['-c','command -v "$1"','fixture',name],{encoding:'utf8'}).stdout.trim();
      if(found)fs.symlinkSync(found,path.join(tools,name));
    }
    const sums=path.join(temp,'SHASUMS');
    const q=value=>"'"+value.replaceAll("'","'\\''")+"'";
    fs.writeFileSync(path.join(tools,'curl'),`#!/bin/sh\nsource_file=''\ndest=''\nwhile [ "$#" -gt 0 ]; do\n case "$1" in\n -o) dest=$2; shift 2;;\n *SHASUMS256.txt) source_file=${q(sums)};shift;;\n *tar.gz) source_file=${q(archive)};shift;;\n *) shift;;\n esac\ndone\n/bin/cp "$source_file" "$dest"\n`,{mode:0o755});
    const root=path.join(temp,'app');fs.mkdirSync(root);fs.copyFileSync('setup.sh',path.join(root,'setup.sh'));fs.writeFileSync(path.join(root,'package-lock.json'),'{}');
    const digest=(await import('node:crypto')).createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    for(const valid of [true,false]) {
      fs.writeFileSync(sums,`${valid?digest:'0'.repeat(64)}  ${folder}.tar.gz\n`);
      const home=path.join(temp,valid?'good-home':'bad-home');fs.mkdirSync(home);
      const result=spawnSync('/bin/sh',[path.join(root,'setup.sh'),'--start'],{encoding:'utf8',env:{...process.env,HOME:home,XDG_STATE_HOME:path.join(home,'state'),PATH:tools},timeout:15000});
      assert.equal(result.status,valid?0:2,result.stderr);
      assert.equal(result.stdout.includes('PRIVATE_NODE_READY'),valid);
    }
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
