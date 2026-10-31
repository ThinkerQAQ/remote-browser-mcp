import fs from 'node:fs';
import {parse} from 'smol-toml';
import {saveSetup} from './lib/setup-config.mjs';
const [command, file] = process.argv.slice(2);
try {
  if (command === 'read') console.log(JSON.stringify(fs.existsSync(file) ? parse(fs.readFileSync(file, 'utf8')) : {}));
  else if (command === 'save') {
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    saveSetup(file, JSON.parse(input.trim().replace(/^\uFEFF/, '')));
  } else throw Error('Unknown setup operation');
} catch (error) {
  const reason = /^Invalid (setup path: [a-z_]+|tunnel ID|language)$/.test(error.message)
    ? error.message : (error.code || error.name || 'UnknownError');
  console.error('Cannot read/write setup configuration (' + reason + '). Check the local TOML file and selected paths.');
  process.exitCode = 2;
}
