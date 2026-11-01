# Remote Browser MCP

[简体中文](README_ZH.md)

- [1. Introduction](#1-introduction)
- [2. Quick Start](#2-quick-start)
- [3. Configuration](#3-configuration)
- [4. Optional Features](#4-optional-features)
- [5. Development](#5-development)
- [6. License](#6-license)

## 1. Introduction

An AI assistant cannot interact with a page in your actual browser just because you gave it a link or screenshot. And letting it take over the tabs you are already using could disrupt your work.

Remote Browser MCP connects an MCP-compatible assistant to **Edge or Chrome after you explicitly enable browser debugging**. It lets the assistant open a separate background tab, inspect a page and interact with websites while **keeping your existing tabs protected by default**. Calls within the same MCP process can reuse the browser connection.

You can use it with a local MCP client, or connect from ChatGPT through your own Tunnel. **This is not a browser extension** and does not need to be installed in the extension manager. Background operation is best effort: browser permission dialogs and website behavior can still change focus.

## 2. Quick Start

This walkthrough installs the software, connects to a local browser and verifies one real MCP operation. You **do not need a Tunnel ID or API key** for local use. Remote ChatGPT setup is covered in [Case 1](#41-case-1-remote-chatgpt).

### 2.1. Prerequisites

You need Windows, Linux or macOS, **a graphical Edge/Chrome desktop session**, Node.js 22+ and npm, plus a local stdio MCP client. Windows works natively; WSL is not required. A headless SSH session is not a substitute for a running desktop browser.

Check the runtime:

```powershell
# Windows PowerShell
node --version
npm.cmd --version
```

```bash
# Linux / macOS
node --version
npm --version
```

For the local path, install a compatible Node.js first. The optional [remote setup wizard](#41-case-1-remote-chatgpt) can provision its own Node/npm when needed.

### 2.2. Download and install

1. Open the [latest Release](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest) and download the archive ending in `-windows.zip`, `-linux.tar.gz` or `-macos.tar.gz`. The archive contains the **Node.js project and platform setup entry**, not a standalone executable or browser extension.
2. Download `SHA256SUMS` from the same Release. Compare the selected archive's checksum against its **matching filename**: Windows `Get-FileHash .\remote-browser-mcp-*-windows.zip -Algorithm SHA256`; Linux `sha256sum ./remote-browser-mcp-*-linux.tar.gz`; macOS `shasum -a 256 ./remote-browser-mcp-*-macos.tar.gz`. Stop if the values differ.
3. Extract the **entire** archive to a stable location. Open a terminal in the folder directly containing `package.json`, `package-lock.json` and `scripts/launch.mjs`. Do not run commands from inside the compressed archive.
4. Install locked dependencies:

**Windows PowerShell** (replace the example directory):

```powershell
Set-Location 'C:\path\to\remote-browser-mcp'
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

**Linux/macOS** (replace the directory):

```bash
cd '/path/to/remote-browser-mcp'
npm ci --ignore-scripts --no-audit --no-fund
```

The installation does not copy your browser profile or require your website login credentials.

### 2.3. Enable browser debugging

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

### 2.4. Verify the browser connection

From the **same extracted project directory** run:

```powershell
# Windows
npm.cmd run doctor
npm.cmd run proxy-smoke
```

```bash
# Linux / macOS
npm run doctor
npm run proxy-smoke
```

`doctor` should report `CDP_READY=true`. `proxy-smoke` then connects to the real browser, creates a dedicated `about:blank` tab in the background, takes its snapshot, and closes **only that test tab**. Successful output contains `MCP_CONNECTED=true`, `NEW_BACKGROUND_PAGE_OK=true`, `SNAPSHOT_OK=true` and `TEST_TAB_CLOSED=true`.

If the browser asks for debugging permission, approve it and repeat this test. Unit tests alone do not prove the actual browser is connected.

### 2.5. Connect a local MCP client

In your **local** MCP client's stdio server settings, replace the sample argument with the absolute path to `scripts/launch.mjs` in the extracted directory:

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

On Windows, forward slashes such as `C:/tools/remote-browser-mcp/scripts/launch.mjs` are supported. If the client cannot resolve `node`, use the absolute executable path. Reconnect or restart the client to discover tools. **The client launches the stdio server**; do not run a second `npm run mcp` process for that connection.

### 2.6. Complete one operation

1. Call `browser_status` and confirm `cdp_ready=true`.
2. Call `new_page` with `url="about:blank"`. The proxy forces a background tab.
3. Note the newly created page ID and call `take_snapshot` using that ID. An empty page snapshot is expected.
4. Call `close_page` with **the same test page ID** and verify it succeeds.

This verifies the **MCP client → proxy → browser** path without touching any existing user tab. A healthy Tunnel alone would not verify this path.

### 2.7. Troubleshooting

- **CDP not ready:** check the running graphical browser, local port 9222 and consent dialog. A Tunnel-ready state does not mean the browser is ready.
- **Only `browser_status` appears:** upstream discovery failed. Recheck the dependency install and `npm run doctor`, then reconnect the client and refresh its tool list.
- **Repeated permission prompts:** a new MCP process or browser restart may need another approval. The proxy reuses an authorized connection within its process but never bypasses browser consent.
- **Existing tabs hidden or selection rejected:** this is the default policy. Create a new dedicated tab instead of enabling access to existing tabs.
- **Client cannot find Node or the script:** use absolute paths. After moving the installation folder, update the client and rerun remote setup if configured.
- **Linux/WSL cannot see Windows Edge:** check which OS runs the Node process; loopback connections do not always cross the Windows/WSL boundary. Use native Windows setup for Windows Edge.

For other failures, [open an Issue](https://github.com/ThinkerQAQ/remote-browser-mcp/issues) with OS, reproducible steps, and sanitized logs. Never upload cookies, personal page snapshots, or credentials.

## 3. Configuration

The defaults in [config.example.toml](config.example.toml) work with Edge on local port 9222, so **no `config.toml` is required for the first run**.

For Chrome or an explicit override, create a private `config.toml` beside `package.json`:

```toml
[browser]
name = "chrome"
endpoint = "http://127.0.0.1:9222"

[security]
allow_existing_pages = false
allow_javascript = false
```

Only loopback port 9222 is accepted. Existing tabs and arbitrary JavaScript execution are **disabled by default**, alongside other unapproved upstream capabilities. Enabling either switch expands the assistant's access; neither is needed for Quick Start.

The remote setup wizard stores nonsecret selections in private config, and protects the runtime key separately using Windows DPAPI, macOS Keychain or Linux Secret Service. Without a working Linux secret store, it uses a passphrase-encrypted file and does not enable unattended login startup.

## 4. Optional Features

### 4.1. Case 1: Remote ChatGPT

To use this from ChatGPT remotely, your account or workspace must support a **custom MCP Tunnel**. Browser debugging and ChatGPT registration are separate requirements.

1. Get **your own** Tunnel ID at [OpenAI Tunnel settings](https://platform.openai.com/settings/organization/tunnels) and an authorized runtime key from [API keys](https://platform.openai.com/api-keys). Do not paste the key into chat or commit it to Git.
2. Download/extract the matching [Release](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest) if not already installed, then run the **native setup wizard**. Unlike the local npm path, the wizard can install Node/npm and the official Tunnel client, asks for your credentials with hidden key input, and guides browser consent.

**Windows PowerShell (native; no WSL):**

```powershell
Set-Location 'C:\path\to\remote-browser-mcp'
.\setup.cmd
```

**Linux:**

```bash
cd '/path/to/remote-browser-mcp'
sh setup.sh
```

**macOS:** open `setup.command` in Finder, or run `sh setup.sh` from the installation directory.

3. Follow the wizard's browser permission prompt, then confirm runtime readiness. When Node/npm is already on your PATH, `npm run tunnel-status` reports a sanitized runtime summary. **Tunnel ready** is not **CDP ready**.
4. In ChatGPT, if available for your account, follow the wizard's **Plugins → Add custom MCP server → Tunnel** instructions. Use your own Tunnel ID, complete the account-side authorization, and enable the connection. The wizard cannot grant account access on your behalf.
5. Start a new chat with that connection. Call `browser_status` and require `cdp_ready=true`, then repeat [2.6](#26-complete-one-operation). Only a successful real tool call confirms the remote connection.

The computer, browser and managed Tunnel must stay running to accept remote work. User-session startup is optional and cannot make a powered-off machine available.

### 4.2. Case 2: Manage the configured runtime

**Linux/macOS**, from the installation root:

```bash
sh setup.sh --check   # preflight only
sh setup.sh --start   # start saved configuration
sh setup.sh --stop    # stop this runtime
```

**Windows PowerShell**, from the installation root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1
# To stop this runtime:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1 -Stop
```

Run only the action you need. Stop an older connection (including a previous WSL deployment) before using the **same Tunnel ID**. The legacy `scripts/setup-wsl-service.sh` is only for existing WSL installations; it does not launch Edge or validate CDP.

### 4.3. Case 3: Separate browser profile

Use a separate `--user-data-dir` as shown in [2.3](#23-enable-browser-debugging) if you do not want to share your everyday browser login state. The new profile has separate cookies and accounts. The proxy creates owned tabs in the background, but focus avoidance is **best effort** because browsers and sites can show dialogs.

## 5. Development

Install Git, Node.js satisfying [package.json](package.json), and npm. From a source checkout:

```bash
git clone https://github.com/ThinkerQAQ/remote-browser-mcp.git
cd remote-browser-mcp
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm audit --omit=dev --audit-level=high
```

Use `npm.cmd` instead of `npm` in Windows PowerShell if required. `check` runs syntax, unit and security-policy tests without a browser. `npm run doctor` and `npm run proxy-smoke` are real-browser integration tests and require consent and a GUI session.

CI covers Node 22/24 on Windows, Linux and macOS with synthetic setup fixtures; it does not prove personal browser authorization, real ChatGPT connection, site focus behavior or reboot persistence. Use feature branches, PR review and Squash Merge.

## 6. License

Original project code is [Apache-2.0](LICENSE). Chrome DevTools MCP, the MCP SDK and the separately installed Tunnel client retain their own terms; see [third-party notices](THIRD_PARTY_NOTICES.md). Website content and user files are not covered by the source license.

**Security:** debugging can access authenticated browser pages. The proxy protects existing tabs and restricts available tools by default, but the user must still review MCP permissions and respect website account checks. MCP requests and results can reach the AI service you connect. Keep the CDP port on loopback, protect `config.toml`, runtime credentials, browser profiles, logs and snapshots, and stop the connection when not needed. Report vulnerabilities privately through the repository's [GitHub security advisories](https://github.com/ThinkerQAQ/remote-browser-mcp/security/advisories), without exposing credentials or private pages publicly.
