# One-entry Windows setup

[简体中文](setup.zh-CN.md) · [README](../README.md)

## Start

Download the repository's [source ZIP](https://github.com/ThinkerQAQ/remote-browser-mcp/archive/refs/heads/main.zip), extract it to a permanent folder and double-click **`setup.cmd`**. Do not run inside the ZIP viewer or move/delete the installation folder afterward.

Alternatively, download [install.ps1](https://raw.githubusercontent.com/ThinkerQAQ/remote-browser-mcp/main/install.ps1) and run it with Windows PowerShell. The bootstrap installs source into `%LOCALAPPDATA%\RemoteBrowserMCP\app` and starts the same wizard:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

No Git, Linux, WSL or administrator account is required by this installer. Windows or company execution restrictions may still apply. The bypass flag affects only this PowerShell process; the wizard does not change machine execution policy. Supported architecture: Windows x64 or ARM64, with Microsoft Edge. If Edge is missing, the wizard opens its official installation page and saves a checkpoint.

## What the wizard does

1. Reuse Node.js 22+ or install a private Node.js 24 LTS copy, without replacing a system installation. Verify the archive against Node's official SHA-256 list.
2. Install locked project dependencies, and reuse an installed Windows `tunnel-client` or download its official release and verify its published SHA-256 digest.
3. Guide you to create/select your own tunnel, enter its full ID and enter the runtime API key with hidden input. Existing choices are reused on the next run.
4. Save non-secret configuration to gitignored `config.toml`. Encrypt the runtime key using Windows user-bound DPAPI outside the repository, in a user-restricted directory.
5. Guide Edge debugging and start/reuse the dedicated native managed runtime. The browser-version probe runs inside that persistent proxy; the wizard reads a private checkpoint instead of creating another CDP connection.
6. Optionally create a per-install Windows sign-in Startup shortcut. It starts only this tool, using the saved encrypted credential. Edge consent can still be required after a browser/process restart.
7. Open ChatGPT Plugins, copy only the tunnel ID and give the exact **Add custom MCP server → Tunnel** registration steps. Prompt you to confirm an actual `browser_status` result.

“One-entry” means one installer and guided configuration; it does not mean bypassing account permissions or security consent. Platform login, tunnel creation/workspace association, Edge consent and the ChatGPT connection are account/user actions. The wizard does not create an OpenAI account or request you paste a key into chat. Secure MCP Tunnel requires tunnel access and a runtime key; the tool does not incur an API model call itself.

## Resume and manage

Run `setup.cmd` again. It reuses dependency installations, selected paths and encrypted credentials, and avoids duplicating a healthy native runtime. If a probe failed, repair Edge debugging and rerun the wizard; it restarts only this tool's native runtime to retry consent. If you change the installation directory, disable the previous installation's sign-in shortcut before configuring the new copy.

```powershell
# Non-mutating preflight: no downloads, secret prompts, browser connections or startup changes.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -CheckOnly

# Explicit language
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -Language en

# Runtime summary (three booleans only)
npm run tunnel-status

# Start/reuse, or stop only this native runtime
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1 -Stop
```

The native alias/profile is `remote-browser-native`. Existing WSL installations remain supported with their original `remote-browser` alias and [phase-two commands](phase2.md). **Stop the old WSL/other client before using the same tunnel natively.** Only one active stdio client per tunnel is supported; this wizard does not stop unrelated deployments or migrate them silently.

## Saved data and honest acceptance

| File or component | Purpose |
| --- | --- |
| `config.toml` in the installation | Browser/security settings and `[setup]` non-secret selections; existing settings are preserved |
| `%LOCALAPPDATA%\RemoteBrowserMCP\state\runtime-key.dpapi` | Credential encrypted for this Windows user and machine; never a plaintext key in TOML or argv |
| Same `state` directory | Dependency cache, private runtime diagnostics, browser health and setup report |
| Windows Startup shortcut | Optional user sign-in startup, uniquely named for the installation path |

Do not upload private configuration, keys, browser profiles or state directories. DPAPI credentials are not portable to another Windows account/machine; enter a key again there. Stop the tool before removing its runtime state. Logon startup is not an always-on service: the computer must remain on and the user must sign in.

`setup-report.json` distinguishes dependency/account/browser/runtime steps, `browser_pending`, `chatgpt_pending`, and `complete_user_confirmed`. A healthy local tunnel alone never sets ChatGPT acceptance. The final confirmation is explicitly **user-reported**, not an automated claim that the installer called ChatGPT tools. Skipping it keeps a pending checkpoint.

Tests cover real Windows PowerShell execution, DPAPI credential round-trip, paths with spaces, resume without a duplicate runtime, and pending-vs-confirmed reporting using an offline tunnel fixture. Live registration, browser background actions and Chat/Work calls were verified separately in the development environment; clean-account consent and sign-in after a real reboot are not simulated by the offline suite.
