import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const securedDirs = new Set();
export function restrict(file, directory = false) {
  if (directory && securedDirs.has(file)) return;
  if (process.platform !== 'win32') { fs.chmodSync(file, directory ? 0o700 : 0o600); return; }
  // Go clients use native Windows ACLs, without PowerShell.
  // The legacy fallback remains for pre-migration installations only.
  if (process.env.RB_ACL_HELPER) {
    const p = spawnSync(process.env.RB_ACL_HELPER, ['protect-path', file, directory ? 'dir' : 'file'],
      { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: 'pipe' });
    if (p.status !== 0) throw new Error('Native private-file permission helper failed');
    if (directory) securedDirs.add(file);
    return;
  }
  // Edit the existing descriptor: constructing a new descriptor and resetting owner
  // can require SeRestorePrivilege even for a file created by the current user.
  // Keep compliant ACLs unchanged: redundant Set-Acl can require SeSecurityPrivilege.
  // Otherwise drop all inherited/explicit ACEs, allow only this user, and verify.
  const script = `$ErrorActionPreference='Stop'; $id=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=Get-Acl -LiteralPath $env:RB_PRIVATE_PATH -ErrorAction Stop; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; if($owner -ne $id.Value -and $owner -ne 'S-1-5-32-544' -and $owner -ne 'S-1-5-18'){throw 'Private path owner is not trusted'}; $before=@($acl.GetAccessRules($true,$false,[System.Security.Principal.SecurityIdentifier])); $alreadyPrivate=($acl.AreAccessRulesProtected -and $before.Count -eq 1 -and $before[0].IdentityReference.Value -eq $id.Value -and $before[0].AccessControlType -eq 'Allow' -and ($before[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl); if(!$alreadyPrivate){$acl.SetAccessRuleProtection($true,$false); foreach($existing in @($acl.Access)){[void]$acl.RemoveAccessRuleSpecific($existing)}; $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($id,'FullControl',${directory ? "'ContainerInherit,ObjectInherit','None'," : ''}'Allow'); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $env:RB_PRIVATE_PATH -AclObject $acl -ErrorAction Stop}; $actual=Get-Acl -LiteralPath $env:RB_PRIVATE_PATH -ErrorAction Stop; $rules=@($actual.GetAccessRules($true,$false,[System.Security.Principal.SecurityIdentifier])); if(!$actual.AreAccessRulesProtected -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $id.Value -or $rules[0].AccessControlType -ne 'Allow' -or ($rules[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl){throw 'Private Windows ACL postcondition failed'}`;
  // GitHub Actions and shells launched by PowerShell 7 may inject a
  // PowerShell 7 PSModulePath into Windows PowerShell 5.1. Remove it so that
  // the built-in Microsoft.PowerShell.Security module can load normally.
  const env = { ...process.env, RB_PRIVATE_PATH: file };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  const p = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (p.status !== 0) {
    // Report enough diagnostic context to identify policy/syntax failures, but
    // never expose the private file path (or its contents) in public CI logs.
    const diagnostic = (p.stderr || p.error?.message || `exit ${p.status}`)
      .replaceAll(file, '<private-path>').trim().slice(0, 600);
    throw new Error(`Could not restrict private Windows ACL: ${diagnostic}`);
  }
  if (directory) securedDirs.add(file);
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
