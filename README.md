# Remote Browser MCP

[简体中文](README_ZH.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Phase 1](docs/phase1.md) · [Phase 2](docs/phase2.md)

Connect an AI assistant to your **already-running Microsoft Edge** via Chrome DevTools MCP and an optional persistent OpenAI tunnel. Reuse existing login sessions while protecting the user's original tabs. Designed for Windows + WSL2, with no custom browser build or headless replacement.

> **Experimental:** The tunnel and MCP runtime can be healthy while the browser's CDP WebSocket is unavailable. Check browser health separately; no guarantee of zero focus changes on arbitrary websites.

## Features

- Connects to an existing Edge CDP session on loopback port 9222; tries the `DevToolsActivePort` WebSocket when `/json/version` is unavailable.
- Supports a persistent MCP process via `tunnel-client`, without creating a new browser for each request.
- Forces `new_page` into the background and prevents `select_page` from bringing windows forward.
- Protects pre-existing user tabs by default; new dedicated tabs share the browser profile's authentication.
- Explicit tool allowlist: no raw network inspection, file upload, heap snapshots, arbitrary JavaScript or newly introduced upstream tools by default.
- Read-only `browser_status` reports CDP readiness without revealing URLs, page titles, or credentials.
- Configuration uses `config.example.toml`; private overrides in `config.toml` are gitignored.

## Quick start (Windows PowerShell)

Requires Node.js 22+ and Edge with remote debugging enabled in `edge://inspect`.

```powershell
npm ci
npm run check
npm run doctor
npm run proxy-smoke
npm run mcp
```

`npm run proxy-smoke` opens **only an about:blank test tab**, verifies protections and closes that test tab. `npm run mcp` runs the guarded local MCP server over stdio. It does **not** create a remote plugin or publish a public CDP endpoint.

## Remote access from ChatGPT

Use [the phase-two guide](docs/phase2.md) to connect your own dedicated OpenAI tunnel through the managed local runtime and create a **private ChatGPT plugin** using the tunnel ID. Keep all identifiers, keys, browser profiles, and user-specific plugin manifests out of this repository. Tunnel readiness does not guarantee the Edge CDP WebSocket is working; call `browser_status` first.


Skill loading does not prove MCP tool discovery. Register and test the MCP connection separately from skill packaging. Imported MCP bundles may be Desktop only; see [registration and troubleshooting](docs/phase2.md#chatgpt-registration-and-acceptance). If upstream discovery fails, only `browser_status` is advertised; refresh the connection after recovery.

## Limitations

- Attaches to an existing Windows Edge session; it does **not** start or repair remote debugging automatically.
- Background mode is best effort; real websites can open native dialogs and alter focus.
- Persistent tunnel, browser CDP and ChatGPT plugin are distinct layers with separate health states and authorization requirements.
- The safe default does **not** operate existing user tabs. Explicit opt-in is required for that mode.
- Local browser access is sensitive; inspect [SECURITY.md](SECURITY.md) before enabling a remote plugin.

Built on [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk). Licensed under Apache-2.0.
