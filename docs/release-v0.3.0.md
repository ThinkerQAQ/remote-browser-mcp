## Remote Browser MCP v0.3.0

First tagged public release with reproducible installers for **Windows**, **Linux** and **macOS**. The Node.js source/runtime is shared across platforms; archives are labeled by platform and use its native setup entry.

| Platform | Archive | Run after extracting |
| --- | --- | --- |
| Windows 10/11 | `remote-browser-mcp-v0.3.0-windows.zip` | `setup.cmd` |
| Linux x64/arm64 | `remote-browser-mcp-v0.3.0-linux.tar.gz` | `sh setup.sh` |
| macOS x64/arm64 | `remote-browser-mcp-v0.3.0-macos.tar.gz` | `sh setup.command` |

Verify the archive SHA-256 with `SHA256SUMS`. Each archive contains the project Apache-2.0 LICENSE, `THIRD_PARTY_NOTICES.md`, Chinese and English guides, and the lockfile. Dependencies and tunnel-client are installed separately by the guided setup, not bundled into these archives.

**Important:** Each user must provide their own Tunnel ID and secret, authorize browser debugging, and register their own ChatGPT MCP. A GitHub Release does not grant universal remote access. The browser CDP health check (`browser_status`) must pass separately from tunnel readiness.

Security defaults preserve existing tabs, use a conservative tool allowlist, and avoid focusing windows when possible; see [SECURITY.md](https://github.com/ThinkerQAQ/remote-browser-mcp/blob/v0.3.0/SECURITY.md).

### 中文简述

正式支持 Windows、Linux、macOS 固定版本安装。下载对应发行包，按照 `SHA256SUMS` 校验，解压后执行该平台的安装入口。三个平台共用同一套 Node.js 实现；Release 不含个人配置、密钥或 Tunnel。用户需自行授权浏览器调试、配置专属 Tunnel 并在 ChatGPT 中注册 MCP；浏览器连接状态单独通过 `browser_status` 验收。
