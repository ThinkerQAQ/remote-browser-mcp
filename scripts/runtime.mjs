import { isDirectExecution } from './entrypoint.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
import { privateWrite, readPrivateJSON } from './private-files.mjs';

const dir = path.join(root, 'runtime');
const state = () => readPrivateJSON(path.join(dir, 'setup.json'));
export const label = `remote-browser-mcp-${crypto.createHash('sha256').update(root).digest('hex').slice(0, 10)}`;
async function run() {
  const s = state();
  const token = crypto.randomBytes(32).toString('hex');
  let child, stopping = false, connecting = s.tunnel_auto_connect !== false, retry, changing = false;
  const status = () => ({label, revision: s.revision || '', connecting});
  const start = () => {
    if (stopping || !connecting || child) return;
    const secret = readPrivateJSON(path.join(dir, 'credentials.json'));
    const fd = fs.openSync(path.join(dir, 'tunnel.log'), fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_WRONLY, 0o600);
    try {
      child = spawn(s.tunnel, [...(s.tunnelArgs || []), 'run', '--config', path.join(dir, 'tunnel.yaml')], {
        env: {...process.env, REMOTE_BROWSER_CONFIG: path.join(root, 'config.toml'), OPENAI_API_KEY: secret.apiKey},
        stdio: ['ignore', fd, fd], windowsHide: true
      });
    } finally { fs.closeSync(fd); }
    const active = child;
    const exited = () => {
      if (child !== active) return;
      child = undefined;
      if (stopping) finish();
      else if (connecting) retry = setTimeout(start, 5000);
    };
    active.once('error', exited); active.once('exit', exited);
  };
  const kill = () => {
    clearTimeout(retry);
    if (!child?.pid) { if (stopping) finish(); return; }
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore'});
    else child.kill('SIGTERM');
  };
  const terminate = () => { stopping = true; connecting = false; kill(); };
  const server = http.createServer(async (req, res) => {
    const action = req.url?.slice(1);
    const valid = req.method === 'GET' && action === 'status' || req.method === 'POST' && ['stop','connect','disconnect'].includes(action);
    if (req.headers.authorization !== `Bearer ${token}` || !valid) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if (action === 'status') { res.end(JSON.stringify(status())); return; }
    if (changing || stopping) { res.writeHead(409); res.end('{}'); return; }
    changing = true;
    try {
      if (action === 'connect') { connecting = true; start(); }
      if (action === 'disconnect') {
        connecting = false;
        const active = child;
        kill();
        if (active && child === active) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { cleanup(); reject(Error('Tunnel did not stop')); }, 4000);
            const done = () => { cleanup(); resolve(); };
            const cleanup = () => { clearTimeout(timer); active.off('exit', done); active.off('error', done); };
            active.once('exit', done); active.once('error', done);
          });
        }
      }
      res.end(JSON.stringify(status()));
      if (action === 'stop') terminate();
    } catch { res.writeHead(500); res.end('{}'); }
    finally { changing = false; }
  });
  const finish = () => { server.close(); server.closeAllConnections(); process.exitCode = 0; };
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  privateWrite(path.join(dir, 'control.json'), JSON.stringify({port: server.address().port, token}));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, terminate);
  start();
}
if (isDirectExecution(import.meta.url)) {
  try {
    if (process.argv[2] !== 'run') throw new Error('Use the Go client for lifecycle management');
    await run();
  } catch { console.error('Tunnel worker failed; check private configuration.'); process.exitCode = 1; }
}
