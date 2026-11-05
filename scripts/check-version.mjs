// Release identity must be the same for npm, the lockfile and built runtime.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const load=async name=>JSON.parse(await readFile(new URL("../"+name,import.meta.url),"utf8"));
const pkg=await load("package.json");
const lock=await load("package-lock.json");
assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
assert.equal(lock.version,pkg.version);
assert.equal(lock.packages[""].version,pkg.version);
const proxy=await readFile(new URL("./proxy.mjs",import.meta.url),"utf8");
assert.equal((proxy.match(/version:appVersion/g)||[]).length,2);
console.log("Release versions aligned: "+pkg.version);
