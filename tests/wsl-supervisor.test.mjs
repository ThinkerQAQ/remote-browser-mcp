import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const script = path.resolve('scripts/setup-wsl-service.sh');
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wsl-tunnel-supervision-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'state');
  fs.mkdirSync(home); fs.mkdirSync(bin); fs.mkdirSync(state);
  const calls = path.join(state, 'calls.log');
  const active = path.join(state, 'active');
  const managed = path.join(state, 'managed');
  const systemctl = `#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
 '--user show-environment'|'--user daemon-reload'|'--user enable remote-browser-tunnel.service') exit 0;;
 '--user is-active --quiet remote-browser-tunnel.service') test -f "$TEST_ACTIVE";;
 '--user is-active remote-browser-tunnel.service') test -f "$TEST_ACTIVE" && echo active || echo inactive;;
 '--user enable --now remote-browser-tunnel.service') touch "$TEST_ACTIVE";;
 '--user disable --now remote-browser-tunnel.service') rm -f "$TEST_ACTIVE";;
 *) echo 'unexpected systemctl command' >&2; exit 2;;
esac
`;
  const tunnel = `#!/bin/sh
printf 'tunnel %s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
 'runtimes status remote-browser --json')
   if test -f "$TEST_MANAGED"; then echo '{"process_running":true}'; else echo '{"process_running":false}'; fi;;
 'runtimes stop remote-browser') rm -f "$TEST_MANAGED";;
 *) exit 2;;
esac
`;
  fs.writeFileSync(path.join(bin,'systemctl'),systemctl,{mode:0o755});
  const client = path.join(home,'.local/bin/tunnel-client');
  fs.mkdirSync(path.dirname(client),{recursive:true});fs.writeFileSync(client,tunnel,{mode:0o755});
  const privateDir=path.join(home,'.config/tunnel-client');fs.mkdirSync(privateDir,{recursive:true});
  fs.writeFileSync(path.join(privateDir,'remote-browser.yaml'),'fixture config, no real secrets');
  fs.writeFileSync(path.join(privateDir,'runtime.env'),'CONTROL_PLANE_API_KEY=fixture-do-not-log',{mode:0o600});
  const env={...process.env,HOME:home,PATH:bin+path.delimiter+process.env.PATH,TEST_CALLS:calls,TEST_ACTIVE:active,TEST_MANAGED:managed};
  const run=(command='install')=>spawnSync('/bin/sh',[script,command],{env,encoding:'utf8',timeout:10000});
  return {root,home,calls,active,managed,run,cleanup:()=>fs.rmSync(root,{force:true,recursive:true})};
};

test('WSL unit migrates managed alias, supervises failure, and preserves active connections', {skip:process.platform==='win32'},()=>{
  const f=fixture();
  try {
    fs.writeFileSync(f.managed,'active');
    const first=f.run(); assert.equal(first.status,0,first.stderr);
    const unit=fs.readFileSync(path.join(f.home,'.config/systemd/user/remote-browser-tunnel.service'),'utf8');
    assert.match(unit,/Restart=always/);assert.match(unit,/RestartSec=15/);
    assert.match(unit,/StartLimitBurst=3/);
    assert.match(unit,/EnvironmentFile=%h\/\.config\/tunnel-client\/runtime\.env/);
    assert.match(unit,/ExecStart=%h\/\.local\/bin\/tunnel-client run/);
    assert.doesNotMatch(unit,/fixture-do-not-log|tunnel_[a-z0-9]+/);
    const calls=fs.readFileSync(f.calls,'utf8');
    assert.equal((calls.match(/runtimes stop remote-browser/g)||[]).length,1);
    assert.ok(calls.indexOf('runtimes stop remote-browser')<calls.indexOf('--user enable --now'));
    assert.equal(f.run().status,0);
    const after=fs.readFileSync(f.calls,'utf8');
    assert.equal((after.match(/--user enable --now/g)||[]).length,1,'must not restart existing connection');
    assert.equal((after.match(/runtimes stop remote-browser/g)||[]).length,1);
    assert.equal(f.run('status').stdout.trim(),'active');
    const legacy=spawnSync('/bin/sh',[path.resolve('scripts/setup-tunnel.sh'),'tunnel_'+'a'.repeat(32)],
      {env:{...process.env,HOME:f.home,PATH:path.dirname(path.join(f.root,'bin/systemctl'))+path.delimiter+process.env.PATH,TEST_CALLS:f.calls,TEST_ACTIVE:f.active,TEST_MANAGED:f.managed},encoding:'utf8',timeout:10000});
    assert.equal(legacy.status,2);
    assert.match(legacy.stderr,/already active/);
    assert.doesNotMatch(fs.readFileSync(f.calls,'utf8'),/runtimes connect/);
    assert.equal(f.run('remove').status,0);
    assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user/remote-browser-tunnel.service')),false);
    assert.equal(fs.existsSync(f.active),false);
  }finally{f.cleanup();}
});

test('WSL startup refuses missing private credential without changing runtime', {skip:process.platform==='win32'},()=>{
  const f=fixture();
  try {
    fs.rmSync(path.join(f.home,'.config/tunnel-client/runtime.env'));
    const result=f.run();
    assert.equal(result.status,2);
    assert.match(result.stderr,/private .*runtime\.env/);
    assert.equal(fs.existsSync(f.calls),true,'systemd session preflight is read-only');
    assert.equal(fs.existsSync(f.active),false);
    assert.equal(fs.existsSync(path.join(f.home,'.config/systemd/user/remote-browser-tunnel.service')),false);
  }finally{f.cleanup();}
});
