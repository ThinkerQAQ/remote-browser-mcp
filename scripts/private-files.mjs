import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const securedDirs = new Set();
export function restrict(file, directory = false) {
  if (directory && securedDirs.has(file)) return;
  if (process.platform !== 'win32') { fs.chmodSync(file, directory ? 0o700 : 0o600); return; }
  // Go clients use native Windows ACLs, without PowerShell.
  if (process.env.RB_ACL_HELPER) {
    const p = spawnSync(process.env.RB_ACL_HELPER, ['protect-path', file, directory ? 'dir' : 'file'],
      { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: 'pipe' });
    if (p.status !== 0) throw new Error('Native private-file permission helper failed');
    if (directory) securedDirs.add(file);
    return;
  }
  throw new Error('Windows requires the bundled Go ACL helper (RB_ACL_HELPER); run the native client.');
}
export function privateDir(dir) {
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Private directory must be a real directory');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); restrict(dir, true);
}
export function privateWrite(file, text, { secureParent = true } = {}) {
  const parent = path.dirname(file);
  if (secureParent) privateDir(parent);
  else {
    // config.toml is stored in the installation root. Its *file* must be
    // private, but restricting the entire installation root breaks upgrades
    // and can require SeSecurityPrivilege on Windows.
    const p = fs.lstatSync(parent, { throwIfNoEntry: false });
    if (!p?.isDirectory() || p.isSymbolicLink()) throw new Error('Parent must be a real existing directory');
  }
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('Refusing non-regular private file');
  const temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, text, { mode: 0o600, flag: 'wx' }); restrict(temp);
    if (process.platform !== 'win32' && (fs.statSync(temp).mode & 0o777) !== 0o600) throw new Error('Private permissions cannot be enforced');
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function readPrivateJSON(file) {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing symlinked private file');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
