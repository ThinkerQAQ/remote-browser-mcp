# Linux and macOS one-entry setup

[简体中文](setup-unix.zh-CN.md) · [Windows](setup.md) · [README](../README.md)

## Start

Download the [source archive](https://github.com/ThinkerQAQ/remote-browser-mcp/archive/refs/heads/main.tar.gz), extract it into a permanent directory, and use:

| Platform | Entry |
| --- | --- |
| Linux | `sh setup.sh` |
| macOS | Double-click `setup.command`, or run `sh setup.sh` |
| Windows | Double-click `setup.cmd` |

For a source-free bootstrap, download [install.sh](https://raw.githubusercontent.com/ThinkerQAQ/remote-browser-mcp/main/install.sh), review it and run `sh install.sh`. It downloads the source into the user's application state directory, then starts the same wizard. Set `REMOTE_BROWSER_INSTALL_DIR` to select another empty installation directory. No Git or WSL is required.

The shell bootstrap needs `curl`, `tar`, `awk` and a SHA-256 utility (`sha256sum` or `shasum`) if Node needs installation. The tunnel archive additionally needs `unzip`. These base OS utilities must be present; if one is missing, the script identifies it for installation through your package manager. It does not silently run sudo. Supported CPU types: x64 and ARM64, on OS versions supported by Node.js 22+. Native GUI browser operation requires a graphical session; this does not create a remote desktop or X server on a headless machine.

## Guided configuration

The entry reuses Node.js 22+ and npm or installs a private Node.js 24 LTS copy, verifies the official archive's SHA-256, and installs locked project dependencies. It downloads an official native `tunnel-client` when needed, verifies the release digest before extracting it and checks its supported CLI. Existing system installations are not replaced.

The wizard guides personal tunnel/workspace access, hidden runtime-key input, local browser selection, service startup and ChatGPT registration. Public account pages are printed even when `xdg-open`/`open` cannot launch them. English is the default unless the locale is Chinese; explicitly select Chinese with `sh setup.sh --language zh-CN`.

Edge and Chrome profile discovery is native on each OS. A running browser with an existing `DevToolsActivePort` is reused. Otherwise the wizard offers an **explicitly selected dedicated profile** with loopback debugging on port 9222; it does not restart existing user windows. Log into websites once in that dedicated profile to retain their login state. Modern Chrome may refuse debugging in its default profile, which is why a separate profile is offered. If port 9222 is occupied or the dedicated browser cannot start, setup remains pending rather than claiming success.

Only one active stdio client may use a tunnel. Stop an old WSL, Windows or other deployment before using its tunnel on another platform. Native Unix uses the alias `remote-browser-unix`; existing WSL deployments keep their original alias and launcher.

## Credential storage

| Environment | Storage | Login startup |
| --- | --- | --- |
| macOS | System Keychain using `/usr/bin/security`; the credential is sent on stdin, never argv | Optional LaunchAgent, subject to keychain/browser consent |
| Linux desktop with `secret-tool` and a usable D-Bus Secret Service | Desktop secret store; stdin input | Optional systemd user login unit |
| Linux without a usable desktop secret store, or key-store failure | AES-256-GCM file with scrypt-derived key and a user unlock passphrase | Disabled; manual unlock required |

Input is hidden. The runtime key and unlock passphrase are not written into TOML, command arguments or setup reports. Encrypted files use mode 600 and state directories mode 700. Passphrase-encrypted storage is authenticated; a wrong passphrase or a modified ciphertext is rejected. There is no hardcoded or automatically persisted unlock passphrase.

macOS Keychain and Linux Secret Service may require OS authorization/unlock. Login startup is offered only for a system-backed store. Falling back to an encrypted file removes this installation's startup registration. systemd user startup requires a functioning user session; a server-only SSH session may not provide it. Startup registration is per user and installation, and is not a system-wide daemon or a guarantee that a browser will already be running at login.

## Resume, check, start and stop

```sh
# Resume the same wizard; retains non-secret TOML choices and saved credential backend.
sh setup.sh

# Non-mutating preflight. Does not download, prompt for secrets, or connect to CDP.
sh setup.sh --check

# Start/reuse configured native runtime; encrypted-file storage prompts for unlock.
sh setup.sh --start

# Stop only the Unix runtime.
sh setup.sh --stop

# Three-boolean runtime summary after configuration.
npm run tunnel-status
```

Non-secret selections are in gitignored `config.toml` under `[setup]` and `[browser]`. Linux state is `${XDG_STATE_HOME:-$HOME/.local/state}/remote-browser-mcp`; macOS state is `~/Library/Application Support/RemoteBrowserMCP`. Treat the browser profile, encrypted credential and account-specific state as private. Do not commit or publish them.

The browser check uses the persistent proxy's health checkpoint, rather than opening another CDP connection from the installer. Edge/Chrome can still request authorization after a browser or proxy restart. Local readiness, browser readiness and user-confirmed ChatGPT tool acceptance are distinct report fields. Skipping ChatGPT verification leaves `chatgpt_pending`; it never marks an end-to-end call as automatically verified.

CI includes native Linux, Windows and macOS runners on Node 22/24. Unix tests cover secure credential round-trips, actual macOS Keychain operations in an isolated test keychain, browser profile paths, startup definitions, fixture-based setup/resume and truthful acceptance state. Interactive browser login, native dialogs and a real OS reboot remain user-environment checks, not something the offline suite proves.
