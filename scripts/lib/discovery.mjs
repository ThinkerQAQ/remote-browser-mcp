export const statusTool = {
  name: "browser_status",
  description: "Read-only CDP health probe (no user tabs or website content).",
  inputSchema: {type: "object", properties: {}, additionalProperties: false},
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}
};

// Keep diagnostics discoverable even when the browser upstream cannot initialize.
// Retry discovery on the next tools/list; never cache a failed attachment as ready.
export async function discoverTools(loadBrowserTools, onUnavailable = () => {}) {
  try {
    return {tools: [statusTool, ...await loadBrowserTools()]};
  } catch {
    onUnavailable();
    return {tools: [statusTool]};
  }
}
