# Remote Browser MCP

[English](README.md)

- [1. Introduction](#1-introduction)
- [2. Quick Start](#2-quick-start)
- [3. Configuration](#3-configuration)
- [4. Optional Features](#4-optional-features)
- [5. Development](#5-development)
- [6. License](#6-license)

## 1. Introduction

让 AI 帮忙处理网页任务时，只给它发送链接或截图，它并不能直接操作电脑里已经打开的浏览器。即使能够连接浏览器，我们也不希望自动操作打断正在看的页面，或者误关已有的标签页。

Remote Browser MCP 让支持 MCP 的 AI 助手连接到**你已允许远程调试的 Edge 或 Chrome**，在后台打开独立标签页、读取页面内容并执行操作，**默认保护你原来打开的标签页**。同一个 MCP 进程还可以复用浏览器连接，减少重复建立连接的开销。

可以在本地 MCP 客户端中直接使用，也可以通过自己的 Tunnel 接入 ChatGPT。**它不是浏览器扩展，不需要在扩展管理页面安装。** 后台操作只能尽力避免抢占焦点；浏览器授权弹窗或网站自身行为仍可能切换窗口。

## 2. Quick Start

下面以打开一个空白网页为例，从安装到连接浏览器，再完成一次实际 MCP 调用。**本地使用不需要 Tunnel ID 或 OpenAI API Key**；需要 ChatGPT 远程连接时，再看 [Case 1](#41-case-1远程连接-chatgpt)。

### 2.1. 准备运行环境

需要 Windows、Linux 或 macOS、**运行在图形桌面中的 Edge/Chrome**、Node.js 22+、npm，以及一个支持 stdio 的本地 MCP 客户端。Windows **原生运行，不需要 WSL**。仅有 SSH 终端而没有图形浏览器，无法直接完成浏览器操作。

先检查 Node 与 npm：

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

本地使用需要先安装受支持的 Node.js。可选的[远程接入向导](#41-case-1远程连接-chatgpt)也能按需安装专用 Node/npm 运行环境。

### 2.2. 下载与安装

1. 打开[最新 Release](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest)，根据系统下载以 `-windows.zip`、`-linux.tar.gz` 或 `-macos.tar.gz` 结尾的文件。发行包是 **Node.js 工程与对应系统的安装脚本**，不是免安装可执行文件，也不是浏览器扩展。
2. 同时下载 `SHA256SUMS`，核对压缩包与其中**相同文件名**的 SHA-256。Windows 下载目录执行 `Get-FileHash .\remote-browser-mcp-*-windows.zip -Algorithm SHA256`；Linux 执行 `sha256sum ./remote-browser-mcp-*-linux.tar.gz`；macOS 执行 `shasum -a 256 ./remote-browser-mcp-*-macos.tar.gz`。不一致时停止安装。
3. 将压缩包**完整解压到固定目录**。在直接包含 `package.json`、`package-lock.json` 和 `scripts/launch.mjs` 的目录打开终端。不要在压缩包内部执行命令。
4. 安装锁定的依赖。

**Windows PowerShell**（将路径替换为实际解压目录）：

```powershell
Set-Location 'C:\path\to\remote-browser-mcp'
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

**Linux/macOS**（替换为实际目录）：

```bash
cd '/path/to/remote-browser-mcp'
npm ci --ignore-scripts --no-audit --no-fund
```

安装依赖不需要复制浏览器配置，也不要求输入网站 Cookie 或登录凭据。

### 2.3. 开启浏览器调试

Remote Browser MCP 只连接**本机 `127.0.0.1:9222` 调试端口**。必须先获得你的浏览器授权，安装 npm 依赖不会自动启用调试。

**Edge：**在准备连接的图形桌面会话中打开 `edge://inspect/#remote-debugging`，开启**远程调试**。出现权限提示时确认授权，并保持浏览器运行。不要为了开启调试直接重启正在使用的个人浏览器。

如果没有这个开关，或者使用 Chrome，可以启动一个带调试参数的**独立浏览器配置**，避免影响常用浏览器。

**Linux，Google Chrome 示例：**

```bash
google-chrome --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/.local/share/remote-browser-mcp-profile" about:blank
```

**macOS，Google Chrome 示例：**

```bash
open -na 'Google Chrome' --args --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/RemoteBrowserMCP/chrome-profile" about:blank
```

Windows 可对已经安装的浏览器可执行文件使用相同参数，`--user-data-dir` 指向**新的独立目录**。独立配置有自己的 Cookie 和登录状态，只需在其中登录准备交给 AI 使用的网站。

**9222 端口只能供本机访问**，不能暴露到局域网或公网。

### 2.4. 验证浏览器连接

回到 [2.2](#22-下载与安装) 的**同一个安装目录**执行：

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

`doctor` 应输出 `CDP_READY=true`。`proxy-smoke` 会连接真实浏览器，在后台新建一个 `about:blank` 测试标签页、读取快照，然后**只关闭这个测试页**。

通过时应出现 `MCP_CONNECTED=true`、`NEW_BACKGROUND_PAGE_OK=true`、`SNAPSHOT_OK=true` 和 `TEST_TAB_CLOSED=true`。单元测试通过不代表浏览器已连接；如出现授权弹窗，确认本次调试后重试。

### 2.5. 连接本地 MCP 客户端

在**本地 MCP 客户端**的 stdio 服务配置中添加以下内容，将示例路径替换为安装目录下 `scripts/launch.mjs` 的**绝对路径**：

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

Windows 路径可以写成 `C:/tools/remote-browser-mcp/scripts/launch.mjs`。如果客户端找不到 `node`，将 `command` 改为 Node 可执行文件的绝对路径。

保存后**重新连接或重启客户端**。客户端会自行启动 stdio 服务，不需要另外启动一份 `npm run mcp`。

### 2.6. 完成第一次操作

1. 调用 `browser_status`，确认返回 `cdp_ready=true`。
2. 调用 `new_page`，设置 `url="about:blank"`。代理会强制将新标签页在后台打开。
3. 记下新创建的页面 ID，对它调用 `take_snapshot`；空白页快照内容很少是正常的。
4. 对**同一个测试页 ID**调用 `close_page`，确认关闭成功。

这就是 **MCP 客户端 → 代理 → 浏览器** 的完整验收，不需要选择或操作已有的用户标签页。Tunnel 就绪也不能替代浏览器验收。

### 2.7. 常见问题

- **CDP 未就绪：**检查图形浏览器是否运行、9222 调试端口和浏览器授权弹窗。Tunnel 正常不代表浏览器正常。
- **只能看到 `browser_status`：**上游工具发现失败。重新检查依赖安装与 `npm run doctor`，重连客户端后刷新工具列表。
- **重复授权：**新的 MCP 进程或浏览器重启后可能需要再次授权；代理会在进程内复用连接，但不会绕过浏览器权限。
- **已有标签页被隐藏或无法选择：**这是默认保护策略。先用 `new_page` 新建专用标签页，不需要修改保护选项。
- **找不到 Node 或脚本：**使用可执行程序与脚本的绝对路径；移动安装目录后需要更新客户端配置，并按需重跑远程向导。
- **Linux/WSL 无法连接 Windows Edge：**检查 Node 运行在哪个操作系统中，Windows 与 WSL 的回环端口不一定互通。连接 Windows Edge 时优先使用原生 Windows 版本。

其他问题可[提交 Issue](https://github.com/ThinkerQAQ/remote-browser-mcp/issues)，附上系统、复现步骤和脱敏错误信息，不要上传 Cookie、私人网页快照或凭据。

## 3. Configuration

默认配置见 [config.example.toml](config.example.toml)。如果使用本机 9222 端口的 Edge，**首次使用无需创建 `config.toml`**。

切换到 Chrome 或覆盖设置时，可在 `package.json` 同级创建私有 `config.toml`：

```toml
[browser]
name = "chrome"
endpoint = "http://127.0.0.1:9222"

[security]
allow_existing_pages = false
allow_javascript = false
```

代理只接受本机回环地址的 9222 端口。`allow_existing_pages` 和 `allow_javascript` 默认都是 `false`，分别限制访问已有标签页和执行任意 JavaScript，其他未经授权的上游工具也被隐藏。更改开关意味着扩大 AI 权限，完成 Quick Start 不需要修改它们。

远程向导将非敏感选项写入私有配置，运行密钥另外保存：**Windows DPAPI、macOS Keychain、Linux Secret Service**。Linux 没有可用系统密钥服务时会采用口令加密文件，并关闭无人值守登录启动。

## 4. Optional Features

### 4.1. Case 1：远程连接 ChatGPT

ChatGPT 远程连接需要你的账号或工作区**支持自定义 MCP Tunnel**，并且目标浏览器已开启经过授权的调试功能。

1. 在 [OpenAI Tunnel 设置](https://platform.openai.com/settings/organization/tunnels)取得**自己的** Tunnel ID，在 [API Keys](https://platform.openai.com/api-keys) 准备具有相应权限的运行密钥。不要在聊天或 Git 中公开密钥。
2. 下载并解压对应 [Release](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest)（如果还没安装），然后运行**原生安装向导**。不同于本地 npm 安装，向导可按需安装 Node/npm 和官方 Tunnel 客户端，隐藏输入凭据、安全保存并指导浏览器授权。

**Windows PowerShell（原生运行，不需要 WSL）：**

```powershell
Set-Location 'C:\path\to\remote-browser-mcp'
.\setup.cmd
```

**Linux：**

```bash
cd '/path/to/remote-browser-mcp'
sh setup.sh
```

**macOS：**在 Finder 中打开 `setup.command`，或在安装目录执行 `sh setup.sh`。

3. 根据向导提示完成浏览器远程调试授权，并检查运行状态。如果 npm 在 PATH 中，可执行 `npm run tunnel-status` 查看脱敏的状态汇总。**Tunnel 就绪不等于浏览器就绪**。
4. 如果你的 ChatGPT 账号支持，按照向导提示进入**插件 → 添加自定义 MCP 服务器 → Tunnel**，选择**自己的 Tunnel ID**，完成账号授权并启用连接。安装程序不能代替你完成账号权限确认。
5. 新建聊天，选择已连接的工具，调用 `browser_status` 并确认 `cdp_ready=true`，再完成 [2.6](#26-完成第一次操作) 的 `new_page → take_snapshot → close_page`。实际调用成功才算远程验收完成。

远程使用期间，电脑、浏览器和 Tunnel 进程都需要保持运行。登录自动启动是可选功能，电脑关机时仍不可用。

### 4.2. Case 2：管理远程运行进程

**Linux/macOS：**在安装目录执行：

```bash
sh setup.sh --check   # 只检查前置条件
sh setup.sh --start   # 启动已有配置
sh setup.sh --stop    # 停止托管进程
```

**Windows PowerShell：**在安装目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1
# 停止该托管进程：
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1 -Stop
```

只执行需要的操作。复用相同 Tunnel ID 前，先停止旧部署（包括此前的 WSL 实例），避免多个进程竞争。`scripts/setup-wsl-service.sh` 仅用于已有旧版 WSL 部署，不会拉起 Edge 或检查浏览器授权。

### 4.3. Case 3：使用独立浏览器配置

不想复用日常浏览器登录状态时，可按 [2.3](#23-开启浏览器调试) 使用单独的 `--user-data-dir`。独立配置有自己的 Cookie 和账号登录状态，只在其中登录准备授权 AI 操作的网站。

代理会默认保护已有标签页，在后台操作新建的专用页面。不过**避免抢占焦点是尽力保证**，浏览器弹窗与网站本身仍可能改变窗口焦点。

## 5. Development

开发需要 Git、符合 [package.json](package.json) 的 Node.js 版本和 npm。从源码运行：

```bash
git clone https://github.com/ThinkerQAQ/remote-browser-mcp.git
cd remote-browser-mcp
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm audit --omit=dev --audit-level=high
```

Windows PowerShell 必要时将 `npm` 换成 `npm.cmd`。`check` 不需要真实浏览器，可运行语法、单元和安全策略检查；`npm run doctor` 与 `npm run proxy-smoke` 是需要已授权桌面浏览器的集成测试。

CI 在 Windows、Linux、macOS 上覆盖 Node 22/24，并使用模拟环境检查安装流程。CI 不能证明个人浏览器已授权、真实 ChatGPT 连接、所有网站的焦点行为或重启后的恢复。代码改动通过功能分支、PR Review 和 Squash Merge。

## 6. License

项目原创代码采用 [Apache-2.0](LICENSE)。Chrome DevTools MCP、MCP SDK 和单独安装的 Tunnel 客户端保留各自许可证，具体见[第三方声明](THIRD_PARTY_NOTICES.md)。网站内容及用户文件不属于本项目源码许可范围。

**安全说明：**浏览器调试可以访问已登录的网站。代理默认保护已有标签页并限制工具，但仍需审查 MCP 权限并遵守网站的账户验证。MCP 请求和结果可能传输给连接的 AI 服务。9222 端口只允许本机使用，不要将原始 CDP 或未认证服务暴露到网络。不要把 `config.toml`、运行凭据、浏览器配置、Cookie、日志或快照提交到 Git。不使用时断开 MCP 或停止运行进程。安全漏洞可通过仓库的 [GitHub 私密漏洞报告](https://github.com/ThinkerQAQ/remote-browser-mcp/security/advisories) 私下提交，不要在公开 Issue 中发布凭据或私人网页数据。
