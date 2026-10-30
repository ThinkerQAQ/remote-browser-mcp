# Phase 1 — Attach to existing Edge

[简体中文](phase1.zh-CN.md) · [README](../README.md)

## Requirements

Windows, Node.js 22+, Microsoft Edge. Use the Windows-native Node.js runtime when Edge is on Windows; WSL2 NAT loopback does not necessarily reach the Windows CDP endpoint.

## Run

1. Open `edge://inspect` in your existing Edge and enable **Allow remote debugging for this browser instance**, if it is not already enabled. This step requires the user's browser interaction.
2. Run `npm ci` in this directory using PowerShell (not WSL npm).
3. Run `npm run doctor`. Expect `CDP_READY=true`. An HTTP 404 can be acceptable when the `DevToolsActivePort` WebSocket probe succeeds.
4. Run `npm run smoke`. Expect `MCP_CONNECTED=true` and `BROWSER_LIST_PAGES_OK=true`.
5. `npm run mcp` runs the upstream MCP over stdio for a compatible local client.

## Safety

- CDP binds to loopback only; never proxy or tunnel it publicly without authentication and strict authorization.
- Existing browser sessions expose login state to authorized debugging clients. No passwords, cookies, titles, or URLs are printed by the smoke test.
- No browsing, clicking, or focus changes are done in the phase-one smoke test.
- MCP stdio is not a remote ChatGPT endpoint. Remote gateway/auth and focus tests are later stages.

Upstream: [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), [Microsoft Edge guide](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/devtools-mcp-server).
