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
  const s = state(), secret = readPrivateJSON(path.join(dir, 'credentials.json'));
  const token = crypto.randomBytes(32).toString('hex');
  let child, stopping = false;
  const terminate = () => {
    stopping = true;
    if (!child?.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill('SIGTERM');
  };
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}` || !((req.url === '/status' && req.method === 'GET') || (req.url === '/stop' && req.method === 'POST'))) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ label, revision: s.revision || "" }));
    if (req.url === '/stop') terminate();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  privateWrite(path.join(dir, 'control.json'), JSON.stringify({ port: server.address().port, token }));
  const args = ['run', '--config', path.join(dir, 'tunnel.yaml')];
  // Worker logs stay private and do not open a console window.
  const logFile = path.join(dir, 'tunnel.log');
  const fd = fs.openSync(logFile, fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_WRONLY, 0o600);
  try {
    child = spawn(s.tunnel, [...(s.tunnelArgs || []), ...args], {
      env: { ...process.env, REMOTE_BROWSER_CONFIG: path.join(root, 'config.toml'), OPENAI_API_KEY: secret.apiKey },
      stdio: ['ignore', fd, fd], windowsHide: true
    });
  } finally { fs.closeSync(fd); }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, terminate);
  const finish = code => { server.close(); server.closeAllConnections(); process.exitCode = stopping ? 0 : (code ?? 1); };
  child.once('error', () => finish(1)); child.once('exit', finish);
}
if (isDirectExecution(import.meta.url)) {
  try {
    if (process.argv[2] !== 'run') throw new Error('Use the Go client for lifecycle management');
    await run();
  } catch { console.error('Tunnel worker failed; check private configuration.'); process.exitCode = 1; }
}
