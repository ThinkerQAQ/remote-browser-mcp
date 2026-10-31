import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {parse, stringify} from 'smol-toml';
import {saveSetup} from './setup-config.mjs';

export const installId = root => crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
export function stateDirectory(platform = process.platform, home = os.homedir(), env = process.env) {
  return platform === 'darwin' ? path.posix.join(home, 'Library/Application Support/RemoteBrowserMCP') : path.posix.join(env.XDG_STATE_HOME || path.posix.join(home, '.local/state'), 'remote-browser-mcp');
}
export function privateDirectory(dir) { fs.mkdirSync(dir, {recursive: true, mode: 0o700}); fs.chmodSync(dir, 0o700); }
export function run(file, args = [], {input, env = process.env, timeout = 45000} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {env, stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Command timed out')); }, timeout);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { if (stdout.length < 4 * 1024 * 1024) stdout += data; });
    child.stderr.on('data', data => { if (stderr.length < 65536) stderr += data; });
    child.on('error', () => { clearTimeout(timer); reject(Error('Command unavailable')); });
    child.on('close', code => { clearTimeout(timer); resolve({code, stdout, stderr}); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
export async function existsCommand(command, runner = run) {
  if (command.includes('/')) return fs.existsSync(command);
  return (await runner('/bin/sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'setup', command])).code === 0;
}
export function quoteArgument(value) {
  if (/[\r\n\0]/.test(value)) throw Error('Invalid command argument');
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
const securityQuote = value => {
  if (/[\r\n\0]/.test(value)) throw Error('Invalid credential input');
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
};
export async function storeCredential({backend, key, passphrase, root, state, runner = run}) {
  if (!key || /[\r\n\0]/.test(key)) throw Error('Invalid runtime key');
  const id = installId(root);
  if (backend === 'keychain') {
    // security interactive input avoids placing the credential in process argv.
    const command = `add-generic-password -U -a ${securityQuote(id)} -s remote-browser-mcp -w ${securityQuote(key)}\n`;
    const result = await runner('/usr/bin/security', ['-i'], {input: command});
    // Interactive security can return zero even when an inner command fails.
    if (result.code !== 0 || /SecKeychain|Error:|failed|error:/i.test(result.stderr)) throw Error('Keychain save failed');
    const check = await loadCredential({backend, root, state, runner});
    if (check !== key) throw Error('Keychain save verification failed');
    return;
  }
  if (backend === 'secret-service') {
    const result = await runner('secret-tool', ['store', '--label=Remote Browser MCP', 'application', 'remote-browser-mcp', 'installation', id], {input: key});
    if (result.code !== 0) throw Error('Secret Service save failed');
    return;
  }
  if (backend !== 'encrypted-file' || !passphrase || passphrase.length < 12) throw Error('Use an unlock passphrase of at least 12 characters');
  privateDirectory(state);
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const derived = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  cipher.setAAD(Buffer.from('remote-browser-mcp-v1:' + id));
  const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  derived.fill(0);
  const file = path.join(state, 'runtime-key.enc.json');
  fs.writeFileSync(file, JSON.stringify({version: 1, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex')}), {mode: 0o600});
  fs.chmodSync(file, 0o600);
}
export async function loadCredential({backend, root, state, passphrase, runner = run}) {
  const id = installId(root);
  if (backend === 'keychain' || backend === 'secret-service') {
    const result = backend === 'keychain'
      ? await runner('/usr/bin/security', ['find-generic-password', '-a', id, '-s', 'remote-browser-mcp', '-w'])
      : await runner('secret-tool', ['lookup', 'application', 'remote-browser-mcp', 'installation', id]);
    if (result.code !== 0 || !result.stdout.trim()) throw Error('Unlock your system key store or reconfigure the credential');
    return result.stdout.trim();
  }
  const saved = JSON.parse(fs.readFileSync(path.join(state, 'runtime-key.enc.json'), 'utf8'));
  if (saved.version !== 1 || !passphrase) throw Error('Unlock passphrase required');
  const key = crypto.scryptSync(passphrase, Buffer.from(saved.salt, 'hex'), 32);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(saved.iv, 'hex'));
    decipher.setAAD(Buffer.from('remote-browser-mcp-v1:' + id));
    decipher.setAuthTag(Buffer.from(saved.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(saved.data, 'hex')), decipher.final()]).toString('utf8');
  } finally { key.fill(0); }
}
export function loadConfig(root) { return parse(fs.readFileSync(path.join(root, 'config.toml'), 'utf8')); }
export function saveUnixConfig(root, setup, browser) {
  const file = path.join(root, 'config.toml');
  saveSetup(file, setup);
  const config = loadConfig(root);
  config.browser = {...config.browser, ...browser};
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, stringify(config), {mode: 0o600}); fs.renameSync(temporary, file);
}
export async function runtimeStatus(setup, runner = run) {
  try {
    const result = await runner(setup.tunnel_client_path, ['runtimes', 'status', 'remote-browser-unix', '--json']);
    if (result.code !== 0) throw Error('Status unavailable');
    return JSON.parse(result.stdout);
  } catch { return {process_running: false, healthy: false, ready: false}; }
}
export async function startRuntime(root, setup, credential, {runner = run, restart = false} = {}) {
  const status = await runtimeStatus(setup, runner);
  if (status.process_running && status.healthy && status.ready && status.tunnel_id === setup.tunnel_id && !restart) return {reused: true};
  if (status.process_running) {
    const stop = await runner(setup.tunnel_client_path, ['runtimes', 'stop', 'remote-browser-unix']);
    if (stop.code !== 0) throw Error('Cannot stop previous native runtime');
  }
  const health = path.join(setup.state_dir, 'browser-health.json');
  fs.rmSync(health, {force: true});
  const env = {...process.env, REMOTE_BROWSER_RUNTIME_KEY: credential, REMOTE_BROWSER_CONFIG: path.join(root, 'config.toml'), REMOTE_BROWSER_SETUP_HEALTH_FILE: health};
  const command = [setup.node_path, path.join(root, 'scripts/launch.mjs')].map(quoteArgument).join(' ');
  const result = await runner(setup.tunnel_client_path, ['runtimes', 'connect', '--alias', 'remote-browser-unix', '--profile', 'remote-browser-unix', '--tunnel-id', setup.tunnel_id, '--runtime-api-key', 'env:REMOTE_BROWSER_RUNTIME_KEY', '--mcp-command', command], {env});
  delete env.REMOTE_BROWSER_RUNTIME_KEY;
  if (result.code !== 0) {
    fs.writeFileSync(path.join(setup.state_dir, 'runtime-error.json'), JSON.stringify({phase: 'connect', exit_code: result.code}), {mode: 0o600});
    throw Error('Runtime connection failed; check tunnel access and credentials');
  }
  const after = await runtimeStatus(setup, runner);
  if (!after.process_running || !after.healthy || !after.ready) throw Error('Runtime is not ready');
  return {reused: false};
}
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function startupPlan(platform, root, setup, home = os.homedir()) {
  if (setup.secret_backend === 'encrypted-file') throw Error('Passphrase-encrypted credentials require manual start; login startup is unavailable');
  const entry = path.join(root, 'scripts/setup-unix.mjs');
  const label = 'com.remote-browser-mcp.' + installId(root);
  if (platform === 'darwin') {
    const args = [setup.node_path, entry, '--start', '--non-interactive'];
    return {file: path.join(home, 'Library/LaunchAgents', label + '.plist'), name: label,
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a => `<string>${xml(a)}</string>`).join('')}</array><key>RunAtLoad</key><true/></dict></plist>\n`};
  }
  if (platform !== 'linux') throw Error('Linux/macOS only');
  const unitQuote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') + '"';
  return {file: path.join(home, '.config/systemd/user', label + '.service'), name: label + '.service', content:
    `[Unit]\nDescription=Remote Browser MCP login startup\nAfter=graphical-session.target\n[Service]\nType=oneshot\nRemainAfterExit=yes\nExecStart=${[setup.node_path, entry, '--start', '--non-interactive'].map(unitQuote).join(' ')}\nExecStop=${[setup.node_path, entry, '--stop'].map(unitQuote).join(' ')}\n[Install]\nWantedBy=default.target\n`};
}
export async function configureStartup(platform, root, setup, enable, {home = os.homedir(), runner = run} = {}) {
  const plan = startupPlan(platform, root, setup, home);
  if (!enable) {
    try {
      if (platform === 'linux') await runner('systemctl', ['--user', 'disable', plan.name]);
      else if (fs.existsSync(plan.file)) await runner('launchctl', ['bootout', `gui/${process.getuid()}`, plan.file]);
    } catch {}
    fs.rmSync(plan.file, {force: true}); return;
  }
  fs.mkdirSync(path.dirname(plan.file), {recursive: true}); fs.writeFileSync(plan.file, plan.content, {mode: 0o600});
  if (platform === 'linux') {
    const reload = await runner('systemctl', ['--user', 'daemon-reload']);
    const result = reload.code === 0 ? await runner('systemctl', ['--user', 'enable', plan.name]) : reload;
    if (result.code !== 0) { fs.rmSync(plan.file, {force: true}); throw Error('No usable systemd user session; start manually'); }
  } else {
    await runner('launchctl', ['bootout', `gui/${process.getuid()}`, plan.file]);
    const result = await runner('launchctl', ['bootstrap', `gui/${process.getuid()}`, plan.file]);
    if (result.code !== 0) { fs.rmSync(plan.file, {force: true}); throw Error('LaunchAgent registration failed; start manually'); }
  }
}
