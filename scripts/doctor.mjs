import fs from "node:fs";
import path from "node:path";

const browserUrl = process.env.CDP_BROWSER_URL || "http://127.0.0.1:9222";
const base = new URL(browserUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  console.error("BLOCKED: phase 1 only permits local loopback CDP.");
  process.exit(2);
}
let httpOK = false;
try {
  const response = await fetch(new URL("/json/version", base), { signal: AbortSignal.timeout(3000) });
  console.log("CDP_HTTP_STATUS=" + response.status);
  if (response.ok) {
    const data = await response.json();
    httpOK = !!data.webSocketDebuggerUrl;
    console.log("CDP_BROWSER=" + (data.Browser || "unknown"));
    console.log("CDP_HTTP_READY=" + httpOK);
  }
} catch (e) { console.log("CDP_HTTP_ERROR=" + e.name); }

let websocketOK = false;
const appData = process.env.LOCALAPPDATA;
const portFile = appData && path.join(appData, "Microsoft", "Edge", "User Data", "DevToolsActivePort");
if (portFile && fs.existsSync(portFile)) {
  try {
    const [port, socketPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
    const validPath = /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(socketPath || "");
    if (port === base.port && validPath) {
      console.log("PORT_FILE_MATCH=true");
      websocketOK = await new Promise((resolve) => {
        let done = false;
        const ws = new WebSocket("ws://" + base.host + socketPath);
        const settle = (ok) => { if (!done) { done = true; try { ws.close(); } catch {} resolve(ok); } };
        const timer = setTimeout(() => settle(false), 3000);
        ws.addEventListener("open", () => ws.send(JSON.stringify({id: 1, method: "Browser.getVersion"})));
        ws.addEventListener("message", (event) => {
          try { settle(!!JSON.parse(event.data).result?.product); }
          catch { settle(false); }
        });
        ws.addEventListener("error", () => settle(false));
        ws.addEventListener("close", () => settle(false));
        timer.unref?.();
      });
    } else { console.log("PORT_FILE_MISMATCH=true"); }
  } catch (e) { console.log("PORT_FILE_ERROR=" + e.name); }
}
console.log("CDP_WEBSOCKET_READY=" + websocketOK);
console.log("CDP_READY=" + (httpOK || websocketOK));
if (!httpOK && !websocketOK) process.exitCode = 2;
