import {controlState, headerState, savedKeyMask, validID} from './state.js';
const $ = id => document.getElementById(id);
const copy = {
  en: {
    title:'Connection settings', subtitle:'Connect ChatGPT to your browser.', overview:'Connection status',
    localTitle:'Local Tunnel service', localDescription:'Save your connection settings, then start the service. Restart applies saved changes to a running service.',
    pluginTitle:'ChatGPT plugin', pluginLink:'Open ChatGPT plugin settings',
    pluginReady:'The local Tunnel is ready. Create or manage your plugin in ChatGPT; plugin authorization is handled there.',
    pluginWaiting:'Start the local Tunnel and wait for it to become ready, then create or manage your plugin in ChatGPT.',
    pluginPending:'Saved changes are waiting for a restart. Apply them before configuring the plugin in ChatGPT.',
    footer:'Settings stay on this computer. Saved API keys are never sent back to this page.',
    idHelp:'Create or manage a Tunnel', keyHelp:'Create a Runtime API Key', saved:'Saved', unsaved:'Not saved',
    savedKey:'Saved · Leave blank to reuse', newID:'Tunnel ID has unsaved changes', newKey:'New Runtime API Key has not been saved',
    save:'Save', start:'Start Service', stop:'Stop Service', restart:'Restart Service',
    checking:'Checking…', unconfigured:'Not configured', stopped:'Service stopped', ready:'Tunnel ready', starting:'Starting · Not ready',
    restartPending:'Saved · Restart required', saving:'Saving…', stopping:'Stopping…', restarting:'Restarting…',
    unavailable:'Status unavailable', error:'Service needs attention', invalidID:'Enter a valid Tunnel ID before saving.',
    missingKey:'Enter a Runtime API Key for the first connection.', invalidKey:'Enter a single-line API key, not the mask placeholder.',
    savedMessage:'Configuration saved.', noChanges:'Configuration is already saved. No changes were made.',
    pendingMessage:'Configuration saved. Restart Service will apply it to the running service.',
    startMessage:'Start requested. Waiting for the Tunnel to become ready.', stopMessage:'Service stopped.',
    restartMessage:'Restart requested. Waiting for the Tunnel to become ready.',
    requestFailed:'Operation failed. Check status before trying again.', statusFailed:'Unable to read local status. Retrying automatically.',
    showKey:'Show entered key', hideKey:'Hide entered key'
  },
  zh: {
    title:'连接设置', subtitle:'让 ChatGPT 连接并操作你的浏览器。', overview:'连接状态',
    localTitle:'本地 Tunnel 服务', localDescription:'保存连接配置后启动服务。服务运行时，重启可应用已保存的修改。',
    pluginTitle:'ChatGPT 插件', pluginLink:'打开 ChatGPT 插件设置',
    pluginReady:'本地 Tunnel 已就绪。请在 ChatGPT 中创建或管理插件，插件授权结果以 ChatGPT 页面为准。',
    pluginWaiting:'请先启动本地 Tunnel 并等待就绪，再到 ChatGPT 中创建或管理插件。',
    pluginPending:'已保存的修改尚未生效，请重启服务后再到 ChatGPT 中配置插件。',
    footer:'配置保存在本机，已保存的 API Key 不会返回此页面。', idHelp:'创建或管理 Tunnel', keyHelp:'创建 Runtime API Key',
    saved:'已保存', unsaved:'尚未保存', savedKey:'已保存；留空则复用', newID:'Tunnel ID 尚未保存', newKey:'新 Runtime API Key 尚未保存',
    save:'保存', start:'启动服务', stop:'停止服务', restart:'重启服务', checking:'正在检查…',
    unconfigured:'尚未配置', stopped:'服务已停止', ready:'Tunnel 已就绪', starting:'启动中 · 尚未就绪',
    restartPending:'已保存 · 等待重启', saving:'正在保存…', stopping:'正在停止…', restarting:'正在重启…',
    unavailable:'无法获取状态', error:'服务需要检查', invalidID:'请填写有效的 Tunnel ID 后再保存。',
    missingKey:'首次连接需要填写 Runtime API Key。', invalidKey:'请填写单行 API Key，不能提交星号占位。',
    savedMessage:'配置已保存。', noChanges:'配置已经保存，无需重复保存。', pendingMessage:'配置已保存，重启服务后生效。',
    startMessage:'已请求启动，正在等待 Tunnel 就绪。', stopMessage:'服务已停止。', restartMessage:'已请求重启，正在等待 Tunnel 就绪。',
    requestFailed:'操作未成功，请检查状态后重试。', statusFailed:'暂时无法读取本地状态，正在自动重试。',
    showKey:'显示新输入的密钥', hideKey:'隐藏新输入的密钥'
  }
};
let language = navigator.language?.startsWith('zh') ? 'zh' : 'en';
let saved = {}, loaded = false, available = false, busy = '', epoch = 0;
let notice = '', noticeError = false;
const t = name => copy[language][name] || name;
const draft = () => ({id:$('id').value, key:$('key').value});
function message(name, error = false) { notice = name; noticeError = error; render(); }
function render() {
  const controls = controlState(saved, draft(), busy, available);
  const badge = loaded || busy ? headerState(saved, busy, available) : {kind:'idle',label:'checking'};
  $('status').dataset.kind = badge.kind;
  $('status-text').textContent = t(badge.label);
  $('save').disabled = !controls.canSave;
  $('service').disabled = !(controls.running ? controls.canStop : controls.canStart);
  $('service').textContent = t(controls.running ? 'stop' : 'start');
  $('restart').disabled = !controls.canRestart;
  $('save').textContent = t('save'); $('restart').textContent = t('restart');
  $('id').disabled = $('key').disabled = !!busy;
  $('id-hint').textContent = t($('id').value.trim() !== (saved.id || '') ? 'newID' : saved.id ? 'saved' : 'unsaved');
  $('key').placeholder = savedKeyMask(saved.has_key);
  $('key-hint').textContent = t($('key').value ? 'newKey' : saved.has_key ? 'savedKey' : 'unsaved');
  $('reveal').disabled = !!busy || !$('key').value;
  $('reveal').setAttribute('aria-label', t($('key').type === 'password' ? 'showKey' : 'hideKey'));
  $('reveal').setAttribute('aria-pressed', String($('key').type !== 'password'));
  $('plugin-description').textContent = t(available && saved.restart_required ? 'pluginPending' : available && saved.tunnel_ready && controls.running ? 'pluginReady' : 'pluginWaiting');
  $('message').textContent = notice ? t(notice) : '';
  $('message').dataset.error = String(noticeError);
}
function localize() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-help]').forEach(el => { el.title = t(el.dataset.help); el.setAttribute('aria-label', el.title); });
  $('language').textContent = language === 'zh' ? 'English' : '中文'; render();
}
function accept(data, afterSave = false) {
  // Polling may update status but must preserve a visible, unsaved ID draft.
  if (!loaded || afterSave || $('id').value === (saved.id || '')) $('id').value = data.id || '';
  saved = data; available = true; loaded = true;
  if (notice === 'statusFailed') notice = '';
  render();
}
async function refresh() {
  if (busy) return;
  const revision = epoch;
  try {
    const response = await fetch('/api/status', {cache:'no-store', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error();
    const data = await response.json();
    if (revision === epoch && !busy) accept(data);
  } catch {
    if (revision === epoch && !busy) { available = false; loaded = true; message('statusFailed', true); }
  }
}
async function action(name) {
  const controls = controlState(saved, draft(), busy, available);
  if (busy || (name === 'start' && !controls.canStart) || (name === 'stop' && !controls.canStop) || (name === 'restart' && !controls.canRestart)) return;
  const body = {action:name};
  const unchanged = name === 'save' && !controls.hasChanges && controls.configured;
  if (name === 'save') {
    body.id = $('id').value.trim(); body.key = $('key').value;
    if (!validID(body.id)) { message('invalidID', true); return; }
    if (!body.key && !saved.has_key) { message('missingKey', true); return; }
    if (/[\r\n\x00]/.test(body.key) || /^\*+$/.test(body.key)) { message('invalidKey', true); return; }
  }
  ++epoch; busy = {save:'saving',start:'starting',stop:'stopping',restart:'restarting'}[name]; notice = ''; render();
  let failed = false;
  try {
    const response = await fetch('/api/action', {method:'POST',headers:{'Content-Type':'application/json','X-RB-Session':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
    const data = await response.json();
    if (!response.ok) throw Error();
    if (name === 'save') { $('key').value = ''; $('key').type = 'password'; }
    accept(data, name === 'save');
    notice = name === 'save' ? unchanged ? 'noChanges' : data.restart_required ? 'pendingMessage' : 'savedMessage' : name + 'Message';
    noticeError = false;
  } catch {
    failed = true; available = false; notice = 'requestFailed'; noticeError = true;
  } finally {
    // Never keep a submitted credential in request objects after completion.
    delete body.key;
    busy = ''; render();
    if (failed) await refresh();
  }
}
$('connection-form').addEventListener('submit', event => { event.preventDefault(); action('save'); });
$('service').addEventListener('click', () => action(saved.managed_process_running ? 'stop' : 'start'));
$('restart').addEventListener('click', () => action('restart'));
$('language').addEventListener('click', () => { language = language === 'zh' ? 'en' : 'zh'; localize(); });
for (const id of ['id','key']) {
  const input = $(id);
  for (const event of ['pointerdown','keydown']) input.addEventListener(event, () => input.readOnly = false);
  input.addEventListener('input', () => { notice = ''; render(); });
}
$('reveal').addEventListener('click', () => { $('key').type = $('key').type === 'password' ? 'text' : 'password'; render(); });
// Detect value changes that do not dispatch input, including password managers.
let visible = JSON.stringify(draft());
const reconcile = setInterval(() => {
  const current = JSON.stringify(draft());
  if (visible !== current) { visible = current; render(); }
}, 300);
let poll;
async function pollStatus() { await refresh(); poll = setTimeout(pollStatus, 4000); }
window.addEventListener('pagehide', () => { clearInterval(reconcile); clearTimeout(poll); $('key').value = ''; });
localize(); pollStatus();
