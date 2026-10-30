import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const browserUrl = process.env.CDP_BROWSER_URL || "http://127.0.0.1:9222";
const u = new URL(browserUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) {
  throw new Error("Remote CDP endpoints are disabled in phase 1.");
}
const pkgDir = path.resolve("node_modules/chrome-devtools-mcp");
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const executable = typeof pkg.bin === "string" ? pkg.bin : pkg.bin["chrome-devtools-mcp"];
if (!executable) throw new Error("Missing chrome-devtools-mcp bin.");
const cli = path.join(pkgDir, executable);
const portFile = process.env.LOCALAPPDATA &&
  path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data", "DevToolsActivePort");
let endpointFlag = "--browser-url=" + browserUrl;
if (portFile && fs.existsSync(portFile)) {
  const [port, wsPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  if (port === u.port && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(wsPath || "")) {
    endpointFlag = "--ws-endpoint=ws://" + u.host + wsPath;
  }
}
const flags = [
  endpointFlag,
  "--usage-statistics=false",
  "--performance-crux=false",
  "--redact-network-headers=true"
];
console.log("MCP_ENDPOINT_MODE=" + (endpointFlag.startsWith("--ws-endpoint") ? "websocket" : "http"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, ...flags],
  env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1" },
  stderr: "pipe"
});
const client = new Client({name: "remote-browser-phase1-smoke", version: "0.1.0"});
try {
  await client.connect(transport);
  const listed = await client.listTools();
  console.log("MCP_CONNECTED=true");
  console.log("MCP_TOOLS=" + listed.tools.length);
  if (!listed.tools.some(t => t.name === "list_pages")) {
    throw new Error("Chrome DevTools MCP list_pages is unavailable");
  }
  const pages = await client.callTool({name: "list_pages", arguments: {}}, undefined, {timeout: 9000});
  if (pages.isError) throw new Error("list_pages returned an error");
  const text = (pages.content || []).filter(v => v.type === "text").map(v => v.text).join("\n");
  const entries = text.split("\n").filter(v => /^\s*\d+\s*:/.test(v));
  console.log("BROWSER_LIST_PAGES_OK=true");
  console.log("BROWSER_PAGE_COUNT=" + entries.length);
  console.log("BROWSER_PAGE_URLS_AND_TITLES=REDACTED");
} catch (error) {
  console.error("SMOKE_ERROR=" + (error?.message || String(error)).slice(0, 240));
  process.exitCode = 2;
} finally {
  await client.close().catch(() => {});
}
