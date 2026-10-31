import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');

test('third-party notices match locked direct npm dependency licenses', () => {
  for (const name of Object.keys(pkg.dependencies)) {
    const resolved = lock.packages[`node_modules/${name}`];
    assert.ok(resolved, `missing resolved dependency: ${name}`);
    assert.ok(resolved.version, `missing locked version: ${name}`);
    assert.ok(resolved.license, `missing locked license identifier: ${name}`);
    const row = `| \`${name}\` | \`${resolved.version}\` | \`${resolved.license}\` |`;
    assert.ok(notices.includes(row), `THIRD_PARTY_NOTICES.md must include current dependency: ${row}`);
  }
});

test('third-party notices explain transitive dependencies and bundled releases', () => {
  assert.match(notices, /transitive-license report/i);
  assert.match(notices, /release artifact/i);
});
