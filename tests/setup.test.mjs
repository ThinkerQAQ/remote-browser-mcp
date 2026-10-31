import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parse} from 'smol-toml';
import {saveSetup, validateSetup} from '../scripts/lib/setup-config.mjs';
import {recordSetupHealth} from '../scripts/lib/setup-health.mjs';
const config = {tunnel_id: 'tunnel_' + 'a'.repeat(32), node_path: 'C:\\Program Files\\Node\\node.exe', tunnel_client_path: 'C:\\工具\\tunnel-client.exe', state_dir: 'C:\\用户资料\\state', language: 'zh-CN'};

test('setup preserves user settings and round-trips Windows paths without storing secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-'));
  try {
    const file = path.join(dir, 'config.toml');
    fs.writeFileSync(file, '[browser]\nendpoint="http://127.0.0.1:9222"\n[security]\nallow_existing_pages=true\nallow_javascript=false\n');
    saveSetup(file, config); saveSetup(file, config);
    const result = parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(result.setup, config);
    assert.equal(result.security.allow_existing_pages, true);
    assert.equal(result.setup.runtime_key, undefined);
    assert.equal(fs.existsSync(file + '.tmp'), false);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('setup validates full tunnel IDs and rejects command-breaking paths', () => {
  assert.throws(() => validateSetup({...config, tunnel_id: 'tunnel_bad'}));
  assert.throws(() => validateSetup({...config, node_path: 'node.exe" & evil'}));
  assert.doesNotThrow(() => validateSetup({...config, tunnel_id: 'tunnel_ab12_' + 'x'.repeat(32)}));
});
test('installer probe checkpoints real status and never serializes upstream details', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-health-'));
  try {
    const file = path.join(dir, 'health.json');
    const probe = async timeout => {
      assert.equal(timeout, 60000);
      assert.equal(JSON.parse(fs.readFileSync(file)).phase, 'waiting_for_edge_consent');
      return {cdp_ready: true, private: 'not-for-output'};
    };
    await recordSetupHealth(probe, file);
    const status = JSON.parse(fs.readFileSync(file));
    assert.equal(status.cdp_ready, true); assert.equal(status.phase, 'finished');
    assert.equal(status.private, undefined);
    await recordSetupHealth(async () => { throw Error('secret detail'); }, file);
    assert.equal(JSON.parse(fs.readFileSync(file)).cdp_ready, false);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
