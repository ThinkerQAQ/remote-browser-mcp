# RemoteBrowserMCP

[简体中文](README_ZH.md)

- [1. Introduction](#1-introduction)
- [2. Quick Start](#2-quick-start)
- [3. Development](#3-development)
- [4. License](#4-license)

## 1. Introduction

An AI assistant cannot interact with a page in your actual browser just because you gave it a link or screenshot. And letting it take over the tabs you are already using could disrupt your work.

Remote Browser MCP connects an MCP-compatible assistant to **Edge or Chrome after you explicitly enable browser debugging**. It lets the assistant open a separate background tab, inspect a page and interact with websites while **keeping your existing tabs protected by default**. Calls within the same MCP process can reuse the browser connection.

You can use it with a local MCP client, or connect from ChatGPT through your own Tunnel. **This is not a browser extension** and does not need to be installed in the extension manager. Background operation is best effort: browser permission dialogs and website behavior can still change focus.

## 2. Quick Start

Install RemoteBrowserMCP, configure the connection, and verify it in ChatGPT. You need an internet connection and a ChatGPT account or workspace that supports custom MCP Tunnel connections. Installers are available for Windows x64, Linux x64, and Intel macOS.

### 2.1. Install

Download the installer for your system from the [latest Release](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest).

#### 2.1.1. Graphical Interface

##### Windows

Run `RemoteBrowserMCP-v*-windows-amd64.exe` and complete the installation wizard. Open **Configure Tunnel** from the Start Menu.

##### macOS

Open `RemoteBrowserMCP-v*-darwin-amd64.dmg` and run the installer application. On the completion screen, select **Open RemoteBrowserMCP configuration** to open the configuration UI in your browser.

##### Linux

Run `RemoteBrowserMCP-v*-linux-amd64.run` from your desktop environment. If execution is blocked, enable it in the file properties. On the completion screen, select **Open RemoteBrowserMCP configuration** to open the configuration UI in your browser.

#### 2.1.2. Command Line

##### Windows

Open a terminal in the download directory:


```powershell
$installer = (Get-ChildItem .\RemoteBrowserMCP-v*-windows-amd64.exe | Select-Object -First 1).FullName
Start-Process -FilePath $installer -ArgumentList '--accept-licenses --default-answer --confirm-command install' -Wait
```


##### macOS

Mount the DMG and run its installer:


```bash
dmg=$(find . -maxdepth 1 -name 'RemoteBrowserMCP-v*-darwin-amd64.dmg' -print -quit)
mount=$(mktemp -d)
hdiutil attach -nobrowse -readonly -mountpoint "$mount" "$dmg"
app=$(find "$mount" -maxdepth 1 -name '*.app' -print -quit)
installer=$(find "$app/Contents/MacOS" -maxdepth 1 -type f -perm -111 -print -quit)
QT_QPA_PLATFORM=offscreen "$installer" --root "$HOME/RemoteBrowserMCP" --accept-licenses --default-answer --confirm-command install
hdiutil detach "$mount"
```


##### Linux


```bash
chmod +x ./RemoteBrowserMCP-v*-linux-amd64.run
QT_QPA_PLATFORM=offscreen ./RemoteBrowserMCP-v*-linux-amd64.run --root "$HOME/RemoteBrowserMCP" --accept-licenses --default-answer --confirm-command install
```

After installation, configure the connection in the next section.

### 2.2. Configuration

Create a [Tunnel ID](https://platform.openai.com/settings/organization/tunnels) and a [Runtime API Key](https://platform.openai.com/settings/organization/api-keys).

#### 2.2.1. Graphical Interface

Enter both values in the configuration UI, save the configuration, start the service, and refresh status to confirm **Local Tunnel: Connected**.

#### 2.2.2. Command Line

From the installation directory:

```bash
./bin/remotebrowsermcp configure
./bin/remotebrowsermcp start
./bin/remotebrowsermcp status
```

On Windows, use `.\bin\remotebrowsermcp.exe` with the same subcommands. Interactive `configure` hides the Runtime API Key. For automation, use `configure --id <tunnel-id> --api-key-stdin` and pass the key through standard input. Use `stop` to stop the service.

#### 2.2.3. Enable browser debugging

The server connects only to the **local debugging endpoint at `127.0.0.1:9222`**. You must enable browser debugging and approve the browser's consent prompt when it appears.

**Edge:** in the desktop browser you want to connect, open `edge://inspect/#remote-debugging`, enable **Remote debugging**, and leave Edge running. Do not restart your personal browser just for this setup.

If you use Chrome, or Edge does not expose that switch, start a **separate browser profile** with loopback debugging. For example:

**Linux (Google Chrome):**

```bash
google-chrome --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/.local/share/remote-browser-mcp-profile" about:blank
```

**macOS (Google Chrome):**

```bash
open -na 'Google Chrome' --args --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/RemoteBrowserMCP/chrome-profile" about:blank
```

On Windows, launch your installed browser executable with the same debugging arguments and a **new** `--user-data-dir` if the browser switch is unavailable. A separate profile has separate cookies and logins; sign in only where you wish to authorize the assistant. **Never expose port 9222 to the network.**


#### 2.2.4. Browser settings and local MCP

The default is Edge at `http://127.0.0.1:9222`. For Chrome or a custom profile, edit `[browser]` in private `config.toml` using the fields in [config.example.toml](config.example.toml). Saving Tunnel settings preserves browser and security options.

For a local stdio MCP client, no Tunnel ID or key is required. Configure the absolute bundled `bin/node` (Windows: `bin/node.exe`) as the command, and the absolute `scripts/launch.mjs` as its argument.

The client and installer support headless CLI operation; browser tools still require a reachable authorized Edge/Chrome debugging session. Tunnel connectivity does not establish browser readiness.

Stop any older script-managed runtime before changing to the new client. Existing encrypted credentials are not imported automatically: enter the key again. A legacy `[setup]` section is rejected to prevent silent migration; remove it only after stopping that runtime. Browser and security settings can remain in place.

### 2.3. Verify in ChatGPT

Open [ChatGPT Plugins](https://chatgpt.com/plugins), register a custom MCP Tunnel using the same Tunnel ID, and authorize the connection. Refer to the [OpenAI connection guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) for current account-specific steps.

In ChatGPT, select the plugin and call the read-only `browser_status` tool. Confirm `cdp_ready=true`, then create an `about:blank` tab with `new_page`, inspect it with `take_snapshot`, and close only that tab with `close_page`.

### 2.4. Troubleshooting

If the Tunnel is not connected, verify the saved ID, key, network, and local service status. If ChatGPT cannot call the tools despite a connected Tunnel, verify that its plugin is registered and selected. Do not share credentials or local logs containing private data.

## 3. Development

You can skip this section if you're using an installer. To work with the source, install Git, npm, and a Node.js version supported by [package.json](package.json):

```bash
git clone https://github.com/ThinkerQAQ/remote-browser-mcp.git
cd remote-browser-mcp
npm ci --no-audit --no-fund
npm run check
node scripts/client-smoke.mjs
npm run audit:high
```

`check` runs unit and compatibility tests; `client-smoke.mjs` checks MCP initialization and tool discovery without requiring a browser. `npm run proxy-smoke` verifies a real browser connection with a dedicated test tab. On Windows PowerShell, use `npm.cmd` if the execution policy blocks the npm shim.

Build the client with Go (`cd client && go build -o ../bin/remotebrowsermcp .`); run `go test ./...` and `go vet ./...` from `client/`.

Changes go through pull-request review and Squash Merge. See [Installer CI](.github/workflows/offline-installers.yml) and [Release CI](.github/workflows/release.yml) for the package builds.

## 4. License

Original project code is licensed under [Apache-2.0](LICENSE). Third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Browser access uses the existing proxy policy: existing tabs and arbitrary JavaScript stay disabled by default. MCP requests and results may be sent to the connected AI service. Runtime keys are kept in `runtime/credentials.json`, restricted to the current OS account; they are not encrypted by this client. Keep `config.toml`, `runtime/`, keys and logs private.

Please report security issues privately through [GitHub Security Advisories](https://github.com/ThinkerQAQ/remote-browser-mcp/security/advisories).
