import {fileURLToPath} from 'node:url';
// Native tunnel supervisors need not inherit this repository as their cwd.
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await import('./proxy.mjs');
