import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline/promises';
import {spawn} from 'node:child_process';
import {browserPortPath} from './lib/browser-profile.mjs';
import {stateDirectory, privateDirectory, run, existsCommand, installId, storeCredential, loadCredential, loadConfig, saveUnixConfig, runtimeStatus, startRuntime, configureStartup} from './lib/unix-setup.mjs';

const rootDefault = fileURLToPath(new URL('../', import.meta.url));
function hiddenInput(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return Promise.reject(Error('A terminal is required for hidden credential input'));
  process.stdout.write(prompt + ': ');
  return new Promise((resolve, reject) => {
    let value = '';
    const previous = process.stdin.isRaw;
    const finish = (error) => {
      process.stdin.removeListener('data', onData); process.stdin.setRawMode(!!previous); process.stdin.pause(); process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u0003' || char === '\u0004') { finish(Error('Setup interrupted')); return; }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData);
  });
}
async function question(label, fallback = '') {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  try { return (await rl.question(`${label} [${fallback}]: `)).trim() || fallback; }
  finally { rl.close(); }
}
async function openURL(url, platform = process.platform, runner = run) {
  return runner(platform === 'darwin' ? '/usr/bin/open' : 'xdg-open', [url]);
}
async function fetchFile(url, file) {
  const response = await fetch(url, {headers: {'User-Agent': 'RemoteBrowserMCP-Setup'}, signal: AbortSignal.timeout(180000)});
  if (!response.ok) throw Error('Official dependency download failed');
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()), {mode: 0o600});
}
export async function installTunnel(state, {platform = process.platform, arch = process.arch, runner = run, fetcher = fetch} = {}) {
  if (!['linux', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw Error('Supported: Linux/macOS x64 or ARM64');
  const cached = path.join(state, 'tools/tunnel/tunnel-client');
  const candidates = [cached, path.join(os.homedir(), '.local/bin/tunnel-client'), 'tunnel-client'];
  for (const candidate of candidates) {
    if (!await existsCommand(candidate, runner)) continue;
    const help = await runner(candidate, ['runtimes', 'connect', '--help']);
    if (help.code === 0 && help.stdout.includes('--tunnel-id') && help.stdout.includes('--runtime-api-key')) {
      if (candidate.includes('/')) return path.resolve(candidate);
      const resolved = await runner('/bin/sh',['-c','command -v "$1"','setup',candidate]);
      if (resolved.code === 0 && path.isAbsolute(resolved.stdout.trim())) return resolved.stdout.trim();
    }
  }
  if (!await existsCommand('unzip', runner)) throw Error('Install unzip with your OS package manager, then rerun setup.sh');
  const response = await fetcher('https://api.github.com/repos/openai/tunnel-client/releases/latest', {headers: {'User-Agent': 'RemoteBrowserMCP-Setup'}, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Cannot read official tunnel-client release');
  const release = await response.json();
  const suffix = `${platform}-${arch === 'x64' ? 'amd64' : 'arm64'}`;
  const asset = release.assets.find(a => new RegExp(`^tunnel-client-v[0-9.]+-${suffix}\\.zip$`).test(a.name));
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !asset.browser_download_url.startsWith('https://github.com/openai/tunnel-client/releases/download/')) throw Error('Invalid official tunnel-client asset/digest');
  privateDirectory(path.dirname(cached));
  const zip = path.join(state, 'tunnel-download.zip');
  const temp = fs.mkdtempSync(path.join(state, 'tunnel-extract-'));
  try {
    await fetchFile(asset.browser_download_url, zip);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    if (actual !== asset.digest.slice(7)) throw Error('Tunnel-client SHA-256 mismatch');
    const unzip = await runner('unzip', ['-q', zip, '-d', temp]);
    if (unzip.code !== 0) throw Error('Cannot extract verified tunnel-client archive');
    const find = dir => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isFile() && entry.name === 'tunnel-client') return path.join(dir, entry.name);
        if (entry.isDirectory()) { const result = find(path.join(dir, entry.name)); if (result) return result; }
      }
    };
    const binary = find(temp);
    if (!binary) throw Error('Missing tunnel-client binary');
    fs.copyFileSync(binary, cached); fs.chmodSync(cached, 0o700);
    const help = await runner(cached, ['runtimes', 'connect', '--help']);
    if (help.code !== 0 || !help.stdout.includes('--tunnel-id')) throw Error('Downloaded tunnel-client cannot run');
    return cached;
  } finally { fs.rmSync(zip, {force: true}); fs.rmSync(temp, {recursive: true, force: true}); }
}
export async function detectBrowser(platform = process.platform, runner = run) {
  const candidates = platform === 'darwin'
    ? [['edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], ['chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']]
    : [['edge', 'microsoft-edge-stable'], ['edge', 'microsoft-edge'], ['chrome', 'google-chrome-stable'], ['chrome', 'google-chrome']];
  for (const [name, binary] of candidates) if (await existsCommand(binary, runner)) return {name, binary};
  return null;
}
async function launchBrowser(binary, profile, {runner = run} = {}) {
  const args = ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9222', `--user-data-dir=${profile}`, 'about:blank'];
  const child = spawn(binary, args, {detached: true, stdio: 'ignore'});
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(Error('Browser launch failed'))); });
  child.unref();
}
async function waitHealth(state) {
  const file = path.join(state, 'browser-health.json');
  const deadline = Date.now() + 65000;
  while (Date.now() < deadline) {
    try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); if (value.phase === 'finished') return value.cdp_ready === true; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}
export async function configure(options = {}) {
  const root = options.root || rootDefault, platform = options.platform || process.platform;
  const state = options.state || stateDirectory(platform);
  const ask = options.ask || question, hidden = options.hidden || hiddenInput, runner = options.runner || run;
  const output = options.output || console.log;
  const locale = options.language || (/^zh/i.test(process.env.LANG || '') ? 'zh-CN' : 'en');
  const t = (en, zh) => locale === 'zh-CN' ? zh : en;
  const open = async url => {
    output(url);
    try { await (options.open || (value => openURL(value, platform, runner)))(url); } catch {}
  };
  privateDirectory(state);
  const report = (phase, extra = {}) => fs.writeFileSync(path.join(state, 'setup-report.json'), JSON.stringify({phase, time: new Date().toISOString(), ...extra}), {mode: 0o600});
  output(t('Remote Browser MCP - Linux/macOS guided setup', 'Remote Browser MCP - Linux/macOS 一键配置向导'));
  report('dependencies');
  const client = await (options.installClient || (() => installTunnel(state, {platform, runner})))();
  let old = {};
  try { old = loadConfig(root); } catch (error) { if (fs.existsSync(path.join(root, 'config.toml'))) throw Error('Repair invalid config.toml before continuing'); }
  report('account');
  if (!old.setup?.tunnel_id) await open('https://platform.openai.com/settings/organization/tunnels');
  output(t('Create/use your own tunnel with ChatGPT workspace access.', '请创建或使用你自己的隧道，并关联 ChatGPT 工作区。'));
  let tunnel = old.setup?.tunnel_id || '';
  do { tunnel = await ask(t('Tunnel ID', '隧道 ID'), tunnel); } while (!/^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$/.test(tunnel));
  let backend = old.setup?.secret_backend;
  let credential, passphrase;
  const replace = !backend || /^y/i.test(await ask(t('Replace saved runtime key? y/N', '替换已保存的运行密钥？y/N'), 'N'));
  if (replace) {
    await open('https://platform.openai.com/api-keys');
    credential = await hidden(t('Runtime API Key (hidden; Tunnels Read + Use)', '运行 API Key（隐藏输入，需 Tunnels Read + Use 权限）'));
    backend = platform === 'darwin' ? 'keychain' : (await existsCommand('secret-tool', runner) && process.env.DBUS_SESSION_BUS_ADDRESS ? 'secret-service' : 'encrypted-file');
    const save = async () => storeCredential({backend, key: credential, passphrase, root, state, runner});
    if (backend !== 'encrypted-file') {
      try { await save(); } catch {
        output(t('System key store is unavailable; using a passphrase-encrypted file.', '系统密钥服务不可用，改用口令加密文件。'));
        backend = 'encrypted-file';
      }
    }
    if (backend === 'encrypted-file') {
      do {
        passphrase = await hidden(t('Unlock passphrase (at least 12 characters)', '解锁口令（至少 12 个字符）'));
      } while (passphrase.length < 12 || passphrase !== await hidden(t('Repeat unlock passphrase', '再次输入解锁口令')));
      await save();
    }
  } else {
    if (backend === 'encrypted-file') passphrase = await hidden(t('Unlock passphrase', '解锁口令'));
    credential = await loadCredential({backend, root, state, passphrase, runner});
  }
  const setup = {...old.setup, tunnel_id: tunnel, node_path: process.execPath, tunnel_client_path: client, state_dir: state, language: locale, native_alias: 'remote-browser-unix', secret_backend: backend};
  report('browser');
  const browserInfo = await (options.detectBrowser || (() => detectBrowser(platform, runner)))();
  if (!browserInfo) {
    saveUnixConfig(root, setup, old.browser || {});
    await open('https://www.microsoft.com/edge/download');
    output(t('Install Edge or Chrome, then rerun setup.sh. Progress saved.', '请安装 Edge 或 Chrome 后重新运行 setup.sh，进度已保存。'));
    return {pending: true};
  }
  const browser = {...old.browser, name: old.browser?.name || browserInfo.name};
  const existingPortFile = browserPortPath({platform, browser: browser.name, userDataDir: browser.user_data_dir});
  if (!fs.existsSync(existingPortFile)) {
    const useDedicated = /^y/i.test(await ask(t('Launch a separate browser profile for automation? Y/n', '是否启动独立的浏览器自动化配置？Y/n'), 'Y'));
    if (useDedicated) {
      browser.name = browserInfo.name; browser.user_data_dir = path.join(state, 'browser-profile'); privateDirectory(browser.user_data_dir);
      await (options.launchBrowser || launchBrowser)(browserInfo.binary, browser.user_data_dir, {runner});
      const portFile = browserPortPath({platform,browser:browser.name,userDataDir:browser.user_data_dir});
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(portFile) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve,250));
      if (!fs.existsSync(portFile) || fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0] !== '9222') {
        saveUnixConfig(root,setup,browser);report('browser_pending',{runtime_ready:false,browser_ready:false});
        output(t('The dedicated profile could not open port 9222. Check for another browser using that port, then rerun setup.sh.', '独立浏览器配置未能打开 9222 端口，请检查端口占用后重新运行 setup.sh。'));
        return {pending:true};
      }
      output(t('Sign in once inside the dedicated browser profile when needed. Existing user windows are not restarted.', '可在独立浏览器配置中登录网站一次，后续复用登录态；不会重启你的原有窗口。'));
    } else {
      output(t('Enable loopback CDP on port 9222 in your running browser, then press Enter. Modern Chrome may require a non-default user data directory.', '请在运行中的浏览器启用 127.0.0.1:9222 调试后按回车；新版 Chrome 可能要求非默认用户数据目录。'));
      await ask(t('Press Enter after enabling debugging', '开启调试后按回车'), '');
    }
  }
  saveUnixConfig(root, setup, browser);
  output(t('Stop any OTHER client using this tunnel (including a previous WSL deployment) before continuing.', '继续前请先停止使用同一隧道的其他客户端，包括旧 WSL 部署。'));
  await ask(t('Press Enter to start/reuse this native runtime', '按回车启动或复用本机服务'), '');
  let priorHealth;
  try { priorHealth = JSON.parse(fs.readFileSync(path.join(state, 'browser-health.json'), 'utf8')); } catch {}
  const started = await startRuntime(root, setup, credential, {runner, restart: replace || priorHealth?.cdp_ready === false});
  credential = undefined; passphrase = undefined;
  output(t('Allow browser remote debugging if prompted. Verifying the persistent connection...', '如浏览器提示，请允许远程调试；正在验证持久连接...'));
  const browserReady = await (options.waitHealth || waitHealth)(state);
  if (!browserReady) { report('browser_pending', {runtime_ready: true, browser_ready: false}); output(t('Check browser CDP/consent and rerun setup.sh.', '请检查浏览器调试与授权后重新运行 setup.sh。')); return {pending: true}; }
  if (backend === 'encrypted-file') {
    await configureStartup(platform, root, {...setup,secret_backend:'secret-service'}, false, {runner,home:options.home||os.homedir()});
    output(t('Encrypted-file credentials require manual unlock; unattended login startup is disabled.', '口令加密文件需要手动解锁，不启用无人值守的登录自启。'));
  } else {
    const enable = /^y/i.test(await ask(t('Start on user login? Y/n', '是否在用户登录时启动？Y/n'), 'Y'));
    try { await configureStartup(platform, root, setup, enable, {runner, home: options.home || os.homedir()}); }
    catch { output(t('Login startup could not be registered. Manual start is available.', '登录自启注册失败，仍可手动启动。')); }
  }
  report('chatgpt_pending', {runtime_ready: true, browser_ready: true, chatgpt_user_confirmed: false});
  output(t(`Local setup passed. ChatGPT Plugins > Add custom MCP server > Tunnel > ${tunnel} > Create as a plugin > Connect.`, `本地配置通过。ChatGPT 插件 → 添加自定义 MCP 服务器 → 隧道 → ${tunnel} → 创建为插件 → 连接。`));
  await open('https://chatgpt.com/plugins');
  output(t('In a new chat select the app and actually call browser_status. Only confirm if cdp_ready=true.', '在新对话选中该工具并实际调用 browser_status，仅在 cdp_ready=true 时确认。'));
  const confirmed = /^y/i.test(await ask(t('ChatGPT test passed? y/N', 'ChatGPT 实测是否通过？y/N'), 'N'));
  if (confirmed) report('complete_user_confirmed', {runtime_ready: true, browser_ready: true, chatgpt_user_confirmed: true});
  return {pending: !confirmed, reused: started.reused};
}
export async function main(args = process.argv.slice(2)) {
  if (!['linux', 'darwin'].includes(process.platform)) throw Error('Use setup.cmd on Windows');
  const root = rootDefault;
  if (args.includes('--help')) { console.log('sh setup.sh [--check | --start | --stop] [--language en|zh-CN]\nmacOS: double-click setup.command. Account login and browser consent remain user actions.'); return; }
  if (args.includes('--check')) {
    const browser = await detectBrowser();
    console.log(JSON.stringify({platform: process.platform, node_available: Number(process.versions.node.split('.')[0]) >= 22, browser_available: !!browser, check_only: true})); return;
  }
  if (args.includes('--start') || args.includes('--stop')) {
    const setup = loadConfig(root).setup;
    if (!setup?.secret_backend) throw Error('Run sh setup.sh first');
    if (args.includes('--stop')) {
      const result = await run(setup.tunnel_client_path, ['runtimes', 'stop', 'remote-browser-unix']);
      if (result.code !== 0) throw Error('Cannot stop native runtime'); return;
    }
    let passphrase;
    if (setup.secret_backend === 'encrypted-file') {
      if (args.includes('--non-interactive')) throw Error('Manual credential unlock is required');
      passphrase = await hiddenInput('Unlock passphrase');
    }
    const key = await loadCredential({backend: setup.secret_backend, root, state: setup.state_dir, passphrase});
    const result = await startRuntime(root, setup, key);
    console.log(JSON.stringify({process_running: true, tunnel_healthy: true, mcp_ready: true, reused: result.reused})); return;
  }
  const languageIndex = args.indexOf('--language');
  const language = languageIndex >= 0 ? args[languageIndex + 1] : undefined;
  if (language && !['en', 'zh-CN'].includes(language)) throw Error('Use --language en or zh-CN');
  const result = await configure({language});
  if (result.pending) console.log('Saved. Account/browser acceptance may remain pending; rerun the same entry to resume.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('Setup paused: ' + (/secret|password|key/i.test(error.message) ? 'Check credential access/unlock and rerun setup.sh.' : error.message)); process.exitCode = 2; });
}
