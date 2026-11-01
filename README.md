# Remote Browser MCP

[简体中文](README_ZH.md)

## Introduction

An MCP server for operating your own Edge/Chrome debugging session through a guarded Chrome DevTools MCP proxy. It opens dedicated background tabs, protects existing user tabs by default, and provides browser health diagnostics. Use it with a local stdio client; an OpenAI tunnel is optional for remote ChatGPT access.

## Quick Start

### 1. Prerequisites

Node.js **22+**, npm, Git, and a graphical Edge or Chrome session on Windows, Linux or macOS. Windows setup targets Edge. Browser access requires your explicit debugging consent. A headless SSH machine does not automatically provide a desktop browser.

### 2. Install and enable debugging

```sh
git clone https://github.com/ThinkerQAQ/remote-browser-mcp.git
cd remote-browser-mcp
npm ci
npm run check
```

In Edge, open `edge://inspect` and enable remote debugging for the intended browser instance. Approve the browser's consent prompt when it appears. The default endpoint is `http://127.0.0.1:9222`.

If the browser does not provide that switch, close only an existing *dedicated test profile* and launch a separate profile explicitly. For example, on Linux with Google Chrome installed:

```sh
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.local/share/remote-browser-mcp-profile"
```

On Windows/macOS use your browser executable with the same two flags and a permanent, separate profile path. Modern Chrome may reject debugging in its default profile. Do not expose port 9222 to the network.

### 3. Configure and verify locally

No config file is required for Edge at the default endpoint. For Chrome or another loopback hostname create `config.toml` in the checkout:

```toml
[browser]
name = "chrome"
endpoint = "http://127.0.0.1:9222"

[security]
allow_existing_pages = false
allow_javascript = false
```

```sh
npm run doctor
npm run proxy-smoke
```

Success means CDP is ready and the smoke test creates an `about:blank` tab, reads its snapshot and closes **that test tab** with exit code 0. Existing tabs must stay protected. This is a real browser test; offline unit tests alone do not establish browser readiness.

### 4. Connect an MCP client and use it

Add a local stdio server to your client's MCP settings, replacing the path. On Windows use forward slashes, for example `C:/tools/remote-browser-mcp/scripts/launch.mjs`.

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/absolute/path/remote-browser-mcp/scripts/launch.mjs"]
    }
  }
}
```

Reconnect the client. Call `browser_status` first; require `cdp_ready=true`. Then ask it to open a new `about:blank` tab, take a snapshot and close that tab. This completes client → proxy → browser acceptance. The client launches the server; `npm run mcp` is the equivalent manual stdio entry for debugging.

### 5. Troubleshooting

- **CDP not ready:** check the configured endpoint, browser process, dedicated profile and consent dialog. Tunnel readiness does not establish CDP readiness.
- **Only `browser_status` appears:** upstream discovery failed. Repair dependencies/browser access, reconnect, refresh tools and request the tool list again.
- **Repeated consent:** a new proxy or browser process may require approval. The status probe reuses its connection within a process, but cannot bypass browser or client consent.
- **Existing page rejected:** expected with the default policy. Create a new dedicated page instead.
- **GUI client cannot find Node:** use its absolute executable path.

## Configuration

[config.example.toml](config.example.toml) is the maintained template. Optional local overrides live in gitignored `config.toml`. `[browser].name` defaults to `edge`; `endpoint` defaults to loopback port 9222. Only loopback port 9222 is accepted. `scripts/launch.mjs` sets the working directory before loading the proxy, so MCP clients need no custom cwd. Both `[security].allow_existing_pages` and `allow_javascript` default to `false`; enabling either grants broader access.

Setup saves non-secret selections under `[setup]`. Runtime secrets are stored outside Git: Windows DPAPI, macOS Keychain, or Linux Secret Service. Linux without an available secret store uses passphrase-encrypted storage and requires manual unlock; unattended startup is disabled in that mode.

## Optional Features

### Guided remote ChatGPT connection

For remote use you need your own tunnel/workspace authorization and runtime key in addition to the browser. Download a platform archive from [Releases](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest), extract to a permanent folder, and run `setup.cmd` on Windows or `sh setup.sh` on Linux/macOS (`setup.command` is the macOS double-click entry). The same entries work from this checkout.

The wizard installs supported Node/npm and official tunnel-client dependencies, guides browser configuration, securely stores the key, starts the runtime and prints registration steps. Unix bootstrap needs curl, tar, awk, unzip and a SHA-256 utility. It requires a GUI session for browser use; Windows does not require WSL.

In ChatGPT, complete **Add custom MCP server → Tunnel** with your own tunnel when your account supports it. Enable the connection, refresh tools, start a new chat and call `browser_status`, then perform the blank-tab workflow above. A packaged skill or healthy tunnel is not proof of tool discovery or a successful call.

Use `npm run tunnel-status` for runtime status. On Unix, `sh setup.sh --check`, `--start`, and `--stop` check/manage the runtime. On Windows use `scripts/start-native.ps1` (add `-Stop` to stop). Optional login startup depends on the native user session, credential store and browser consent. Stop an older deployment before reusing its tunnel; one tunnel must not have competing runtimes.

For existing WSL deployments only, `scripts/setup-wsl-service.sh install|status|remove` manages the legacy user supervisor after tunnel configuration. It does not start Edge or prove browser readiness.

## Development

```sh
npm ci
npm run check
npm run proxy-smoke
```

`check` includes unit/security-policy tests; `proxy-smoke` requires a real debugging browser. CI runs offline tests and setup fixtures on Windows, Linux and macOS with Node 22/24, including native Windows setup and macOS isolated-Keychain tests. Interactive account registration, website login, native dialogs, focus behavior on arbitrary sites and reboot persistence need separate real-environment verification. Background operation is best effort. Use feature branches, PRs and Squash Merge.

## License

Original integration code is [Apache-2.0](LICENSE); Chrome DevTools MCP and the MCP SDK retain their own licenses. See [third-party notices](THIRD_PARTY_NOTICES.md) and [security policy](SECURITY.md). Debugging grants access to the selected browser profile's authenticated pages. Requests/results may reach the connected AI provider. Keep credentials, browser profiles, runtime state and user-specific plugin manifests private. The license does not grant rights to website content or bypass site permissions.
