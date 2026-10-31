import fs from 'node:fs';
import path from 'node:path';
import {parse, stringify} from 'smol-toml';

export function validateSetup(setup) {
  if (!/^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$/.test(setup.tunnel_id || ''))
    throw Error('Invalid tunnel ID');
  for (const key of ['node_path', 'tunnel_client_path', 'state_dir'])
    if (typeof setup[key] !== 'string' || !setup[key] || /[\r\n\0"]/.test(setup[key]))
      throw Error('Invalid setup path: ' + key);
  if (!['en', 'zh-CN'].includes(setup.language)) throw Error('Invalid language');
  return setup;
}
export function saveSetup(file, setup) {
  validateSetup(setup);
  const existing = fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : {};
  // Preserve the user's browser/security settings and all unrelated TOML keys.
  existing.browser ??= {endpoint: 'http://127.0.0.1:9222'};
  existing.security ??= {allow_existing_pages: false, allow_javascript: false};
  existing.setup = {...existing.setup, ...setup};
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, stringify(existing), {mode: 0o600});
  fs.renameSync(temporary, file);
}
