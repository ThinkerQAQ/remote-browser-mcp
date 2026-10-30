import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const browserUrl = process.env.CDP_BROWSER_URL || "http://127.0.0.1:9222";
const u = new URL(browserUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) {
  throw new Error("Phase 1 requires a loopback CDP address.");
}
const packageDir = path.resolve("node_modules/chrome-devtools-mcp");
const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
const executable = typeof pkg.bin === "string" ? pkg.bin : pkg.bin["chrome-devtools-mcp"];
const cli = path.join(packageDir, executable);
let endpointFlag = "--browser-url=" + browserUrl;
const portFile = process.env.LOCALAPPDATA &&
  path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data", "DevToolsActivePort");
if (portFile && fs.existsSync(portFile)) {
  const [port, wsPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  if (port === u.port && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(wsPath || "")) {
    endpointFlag = "--ws-endpoint=ws://" + u.host + wsPath;
  }
}
const args = [cli, endpointFlag, "--usage-statistics=false",
  "--performance-crux=false", "--redact-network-headers=true"];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1"}
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", err => { console.error(err.message); process.exitCode = 1; });
