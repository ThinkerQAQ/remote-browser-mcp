// Browser-neutral control rules; no credentials are stored here.
export const validID = id => /^tunnel_[A-Za-z0-9_-]+$/.test(id || '');
export const savedKeyMask = hasKey => hasKey ? '****************' : '';
export function controlState(saved, draft, busy = '', available = true) {
  const configured = validID(saved.id) && saved.has_key === true;
  const hasChanges = draft.id.trim() !== (saved.id || '') || draft.key !== '' || (draft.autostart_enabled !== undefined && saved.autostart_enabled !== null && draft.autostart_enabled !== (saved.autostart_enabled === true)) || (draft.tunnel_auto_connect !== undefined && draft.tunnel_auto_connect !== (saved.tunnel_auto_connect !== false));
  const running = saved.managed_process_running === true;
  return {
    configured, hasChanges, running,
    canConnect: !busy && available && configured && !hasChanges && running && !saved.restart_required && !saved.tunnel_connecting,
    canDisconnect: !busy && running && saved.tunnel_connecting === true,
    canSave: !busy,
    canStart: !busy && available && configured && !hasChanges && !running,
    canStop: !busy && running,
    canRestart: !busy && available && configured && !hasChanges && running
  };
}
export function headerState(saved, busy = '', available = true) {
  if (busy) return {kind:'pending', label:busy};
  if (!available) return {kind:'error', label:'unavailable'};
  if (saved.error) return {kind:'error', label:'error'};
  if (saved.managed_process_running && saved.restart_required) return {kind:'pending', label:'restartPending'};
  if (saved.managed_process_running && saved.tunnel_ready) return {kind:'ready', label:'ready'};
  if (saved.managed_process_running && saved.tunnel_connecting === false) return {kind:'idle', label:'standby'};
  if (saved.managed_process_running) return {kind:'pending', label:'starting'};
  return {kind:'idle', label: validID(saved.id) && saved.has_key ? 'stopped' : 'unconfigured'};
}
