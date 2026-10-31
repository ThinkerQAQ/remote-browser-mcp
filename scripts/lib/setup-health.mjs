import fs from 'node:fs';
import path from 'node:path';

// Optional installer checkpoint from the same persistent health probe used by
// browser_status. The installer reads this file instead of opening another CDP.
export function writeSetupHealth(state, file = process.env.REMOTE_BROWSER_SETUP_HEALTH_FILE) {
  if (!file) return;
  if (!path.isAbsolute(file)) throw Error('Setup health path must be absolute');
  const write = state => {
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({...state, pid: process.pid, time: new Date().toISOString()}), {mode: 0o600});
    fs.renameSync(temporary, file);
  };
  write(state);
}
export async function recordSetupHealth(probe, file = process.env.REMOTE_BROWSER_SETUP_HEALTH_FILE) {
  if (!file) return;
  writeSetupHealth({phase: 'waiting_for_edge_consent', cdp_ready: false}, file);
  let status;
  try { status = await probe(60000); }
  catch { status = {cdp_ready: false}; }
  writeSetupHealth({phase: 'finished', cdp_ready: status.cdp_ready === true}, file);
}
