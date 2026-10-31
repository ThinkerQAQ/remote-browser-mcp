import {spawnSync} from 'node:child_process';
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'powershell.exe' : '/bin/sh', windows
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/setup.ps1', '-CheckOnly']
  : ['setup.sh', '--check'], {stdio: 'inherit'});
process.exitCode = result.status ?? 2;
