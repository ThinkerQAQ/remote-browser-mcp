import test from "node:test";
import assert from "node:assert/strict";
import {discoverTools} from "../scripts/lib/discovery.mjs";

test("failed upstream discovery still exposes diagnostics and recovers on refresh", async () => {
  let attempts = 0, warnings = 0;
  const load = async () => {
    if (++attempts === 1) throw Error("private upstream failure");
    return [{name: "list_pages", inputSchema: {type: "object"}}];
  };
  const degraded = await discoverTools(load, () => warnings++);
  assert.deepEqual(degraded.tools.map(t => t.name), ["browser_status"]);
  assert.equal(degraded.tools[0].annotations.readOnlyHint, true);
  assert.equal(JSON.stringify(degraded).includes("private upstream failure"), false);
  const recovered = await discoverTools(load);
  assert.deepEqual(recovered.tools.map(t => t.name), ["browser_status", "list_pages"]);
  assert.equal(attempts, 2);
  assert.equal(warnings, 1);
});
