# RemoteBrowserMCP

[简体中文](README_ZH.md)

- [1. Introduction](#1-introduction)
- [2. Quick Start](#2-quick-start)
- [3. Development](#3-development)
- [4. License](#4-license)

## 1. Introduction

I started RemoteBrowserMCP because I wanted to use ChatGPT on the web to operate the browser on my own computer—for example, to read pages, gather information, or fill in forms.

ChatGPT can analyze links, text, and screenshots, but opening a page in my browser, clicking a button, and continuing a task requires tools that can connect to that browser. For websites where I am already signed in, I also wanted it to reuse that browser session with my permission, reducing the need to copy content back and forth or perform each step myself.

RemoteBrowserMCP provides those browser tools through MCP and uses OpenAI Secure MCP Tunnel to connect them to ChatGPT on the web. The tools run locally, and the computer initiates the Tunnel connection, so there is no need to expose the browser's debugging port to the internet.

Once connected, you can describe a task in the conversation and let ChatGPT read pages, click, and type in Edge or Chrome after you have authorized remote debugging. The project protects existing tabs by default and prefers separate background tabs to minimize interruptions to everyday browsing. Calls within the same MCP process also reuse the browser connection instead of reconnecting for every operation.

The project includes installers for Windows, Linux, and macOS, with graphical and command-line interfaces that share the same logic. Install it, configure the Tunnel, enable browser debugging, and register the plugin in ChatGPT to connect to your browser from ChatGPT on the web. The tools can also be used with other local MCP-compatible clients.

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

Enter the Tunnel ID and Runtime API Key, click **Save**, then **Start Service**. Status updates automatically; wait for **Tunnel ready** in the upper-right corner. To apply saved changes while the service is running, use **Restart Service**. A saved key is shown as a masked placeholder; leave the field blank to reuse it.

The connection page has two independent preferences:

- **Start local service at login** registers a real startup entry for the current installation. Windows uses a limited, interactive Task Scheduler logon task without storing an account password; Linux uses a systemd user unit; macOS uses a LaunchAgent. Existing native service installations keep their service manager and change its startup setting instead. Saving never starts or stops the current service. A usable user session and permission to manage the corresponding startup entry are required; registration errors are reported rather than treated as success.
- **Connect Tunnel automatically** controls whether a newly started service connects the saved Tunnel. It defaults to enabled for existing installations. When disabled, the service starts in standby; **Connect Tunnel** and **Disconnect Tunnel** control the current connection without changing this preference. Restart applies saved connection changes and the automatic-connection preference.

**Stop Service** stops this run, including the Tunnel, while retaining both preferences. If login startup remains enabled, the next login starts it again. Disabling login startup does not stop the current run. On macOS a newly enabled LaunchAgent is loaded at the next login; use **Start Service** to run immediately. Linux user startup normally occurs at login, not before login; this client does not enable lingering. Windows and macOS browser access likewise runs in the user's login session.

CLI equivalents (use the Windows executable path where appropriate):

```sh
./bin/remotebrowsermcp configure --id tunnel_EXAMPLE --autostart=true --auto-connect=false
./bin/remotebrowsermcp start
./bin/remotebrowsermcp connect
./bin/remotebrowsermcp disconnect
```

These commands reuse an already saved key. For a first setup, also pass `--api-key-stdin`. Omitted preference flags preserve the saved values. `status` reports the actual OS startup registration; an unavailable OS backend is not reported as enabled. Failed registration restores the previous connection files and attempts to restore the previous registration.

For upgrades, keep the same installation directory and use the maintenance/update flow; retain `config.toml`, `runtime/`, browser profiles and user data. Startup preferences live in private `runtime/setup.json`, alongside the existing Tunnel ID; the key remains in private `runtime/credentials.json`. Installer payloads exclude these files and data directories. Moving the installation changes its startup identity: disable the old installation's startup entry before moving, then enable it from the new location. To uninstall, first disable login startup and stop the service (or uninstall an explicitly installed native service), then remove the application.


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
