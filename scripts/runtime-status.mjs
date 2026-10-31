import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {parse} from 'smol-toml';

// Never print full runtime status: it includes private logs/IDs.
try {
  const native = process.platform === 'win32';
  const config = native ? parse(fs.readFileSync('config.toml', 'utf8')) : {};
  const client = native ? config.setup?.tunnel_client_path : path.join(os.homedir(), '.local/bin/tunnel-client');
  const alias = native ? 'remote-browser-native' : 'remote-browser';
  if (!client) throw Error('Setup required');
  const status = JSON.parse(execFileSync(client,
    ['runtimes', 'status', alias, '--json'],
    {encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe']}));
  const summary = {
    process_running: status.process_running === true,
    tunnel_healthy: status.healthy === true,
    mcp_ready: status.ready === true
  };
  console.log(JSON.stringify(summary));
  if (!Object.values(summary).every(Boolean)) process.exitCode = 2;
} catch {
  console.error('Runtime status unavailable. Run setup.cmd on Windows, or check tunnel-client in WSL; inspect private local logs.');
  process.exitCode = 2;
}
