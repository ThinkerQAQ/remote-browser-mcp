import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const platform = process.platform;
const ext = platform === 'win32' ? '.exe' : '';
const binary = path.join(root, 'bin', 'remotebrowsermcp' + ext);
const tunnel = path.join(root, 'bin', 'tunnel-client' + ext);
const node = path.join(root, 'bin', 'node' + ext);
const result = {
  node_supported: Number(process.versions.node.split('.')[0]) >= 22,
  native_client_available: fs.existsSync(binary),
  tunnel_client_available: fs.existsSync(tunnel),
  bundled_node_available: fs.existsSync(node),
  script_interpreter_required: false,
};
console.log(JSON.stringify(result, null, 2));
if (!result.node_supported || !result.native_client_available || !result.tunnel_client_available) process.exitCode = 1;
