# Remote Browser MCP

[简体中文](README_ZH.md) · [Phase 1](docs/phase1.md) · [Phase 2](docs/phase2.md)

A minimal integration harness for attaching Chrome DevTools MCP to an **already-running Microsoft Edge** session. It does not launch or restart Edge. Phase 2 forces new tabs into the background and protects existing tabs by default.

## Quick start (Windows PowerShell)

```powershell
npm ci
npm run doctor
npm run smoke
npm run proxy-smoke
```

Requires Node.js 22+ and an Edge session with remote debugging enabled. The doctor checks the local CDP HTTP endpoint and the browser WebSocket discovered from Edge's `DevToolsActivePort` file. The smoke test connects to the upstream MCP server and calls read-only `list_pages`.

## Scope

- **Phase 1:** existing Edge, CDP diagnostics, upstream MCP integration, read-only smoke test.
- **Phase 2:** local MCP proxy, safe background tabs, blocked access to existing user tabs, WSL-to-Windows MCP interop.
- **Pending:** a dedicated OpenAI tunnel ID, persistent remote registration and cross-chat validation.
- No browser profile data, cookies, or tokens are stored or printed.

See [setup and troubleshooting](docs/phase1.md). Never expose the CDP port to a public network.
