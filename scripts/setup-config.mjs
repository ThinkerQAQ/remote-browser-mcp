import fs from 'node:fs';
import {parse} from 'smol-toml';
import {saveSetup} from './lib/setup-config.mjs';
const [command, file] = process.argv.slice(2);
try {
  if (command === 'read') console.log(JSON.stringify(fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : {}));
  else if (command === 'save') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    saveSetup(file, JSON.parse(input));
  } else throw Error('Unknown setup operation');
} catch {
  console.error('Cannot read/write setup configuration. Check the local TOML file and selected paths.');
  process.exitCode = 2;
}
