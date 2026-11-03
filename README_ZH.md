# RemoteBrowserMCP

[English](README.md)

- [1. Introduction](#1-introduction)
- [2. Quick Start](#2-quick-start)
- [3. Development](#3-development)
- [4. License](#4-license)

## 1. Introduction

让 AI 帮忙处理网页任务时，只给它发送链接或截图，它并不能直接操作电脑里已经打开的浏览器。即使能够连接浏览器，我们也不希望自动操作打断正在看的页面，或者误关已有的标签页。

Remote Browser MCP 让支持 MCP 的 AI 助手连接到**你已允许远程调试的 Edge 或 Chrome**，在后台打开独立标签页、读取页面内容并执行操作，**默认保护你原来打开的标签页**。同一个 MCP 进程还可以复用浏览器连接，减少重复建立连接的开销。

可以在本地 MCP 客户端中直接使用，也可以通过自己的 Tunnel 接入 ChatGPT。**它不是浏览器扩展，不需要在扩展管理页面安装。** 后台操作只能尽力避免抢占焦点；浏览器授权弹窗或网站自身行为仍可能切换窗口。

## 2. Quick Start

安装 RemoteBrowserMCP，配置连接，然后在 ChatGPT 中验证。需要网络连接和支持自定义 MCP Tunnel 的 ChatGPT 账号或工作区；安装包支持 Windows x64、Linux x64 和 Intel macOS。

### 2.1. 安装

从 [最新 Release](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest) 下载对应平台的安装包。

#### 2.1.1. 图形界面

##### Windows

运行 `RemoteBrowserMCP-v*-windows-amd64.exe`，按照安装向导完成安装，然后从开始菜单打开 **Configure Tunnel**。

##### macOS

打开 `RemoteBrowserMCP-v*-darwin-amd64.dmg`，运行其中的安装程序。安装完成时勾选 **Open RemoteBrowserMCP configuration**，即可在浏览器中打开配置界面。

##### Linux

在桌面环境中运行 `RemoteBrowserMCP-v*-linux-amd64.run`。如果提示没有执行权限，先在文件属性中允许作为程序运行。安装完成时勾选 **Open RemoteBrowserMCP configuration**，即可在浏览器中打开配置界面。

#### 2.1.2. 命令行

##### Windows

在下载目录打开终端：


```powershell
$installer = (Get-ChildItem .\RemoteBrowserMCP-v*-windows-amd64.exe | Select-Object -First 1).FullName
Start-Process -FilePath $installer -ArgumentList '--accept-licenses --default-answer --confirm-command install' -Wait
```


##### macOS

挂载 DMG 并运行其中的安装器：


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

安装完成后，按下一节配置连接。

### 2.2. 配置

先在 [OpenAI Tunnel 设置](https://platform.openai.com/settings/organization/tunnels)创建 Tunnel ID，再通过 [API Keys](https://platform.openai.com/settings/organization/api-keys) 创建 Runtime API Key。

#### 2.2.1. 图形界面

在配置界面填写 Tunnel ID 和 Runtime API Key，保存并启动服务，然后刷新状态，确认 **Local Tunnel: Connected**。

#### 2.2.2. 命令行

在安装目录运行：

```bash
./bin/remotebrowsermcp configure
./bin/remotebrowsermcp start
./bin/remotebrowsermcp status
```

Windows 使用 `.\bin\remotebrowsermcp.exe`，子命令相同。交互式配置会隐藏 Runtime API Key；自动化场景可使用 `configure --id <tunnel-id> --api-key-stdin`，通过标准输入传递密钥。停止服务使用 `stop`。

#### 2.2.3. 开启浏览器调试

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


#### 2.2.4. 浏览器设置与本地 MCP

默认连接 Edge 的 `http://127.0.0.1:9222`。使用 Chrome 或自定义配置目录时，参照 [config.example.toml](config.example.toml) 修改私有 `config.toml` 的 `[browser]`。保存 Tunnel 配置会保留浏览器和安全选项。

本地 stdio MCP 客户端无需 Tunnel ID 或密钥：将安装目录内 `bin/node`（Windows 为 `bin/node.exe`）的绝对路径设为命令，`scripts/launch.mjs` 的绝对路径设为参数。

客户端和安装器支持无界面命令行操作；浏览器工具仍需要已授权、可访问的 Edge/Chrome 调试会话。Tunnel 连通不代表浏览器已就绪。

迁移前先停止旧版脚本管理的运行实例。新客户端不自动导入旧版加密凭据，需要重新输入密钥；检测到旧 `[setup]` 节时会拒绝保存，确认旧实例已停止后再移除此节，保留浏览器和安全设置。新密钥保存在仅当前系统账户可访问的 `runtime/credentials.json`，客户端不对其加密。

### 2.3. 在 ChatGPT 验证

打开 [ChatGPT Plugins](https://chatgpt.com/plugins)，使用相同的 Tunnel ID 注册自定义 MCP 插件并完成授权。具体步骤见 [OpenAI 连接指南](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)。

在 ChatGPT 选择插件，调用只读工具 `browser_status`。确认 `cdp_ready=true`，再用 `new_page` 创建 `about:blank` 测试页，调用 `take_snapshot`，最后仅用 `close_page` 关闭该测试页。

### 2.4. 故障排查

Tunnel 未连接时，检查 ID、密钥、网络和服务状态。Tunnel 已连接但 ChatGPT 无法调用时，检查插件是否注册并在当前会话启用。不要公开密钥或含有私人信息的日志。

## 3. Development

如果只是使用安装包，不需要本节。需要修改源码或运行测试时，准备 Git，以及符合 [package.json](package.json) 要求的 Node.js 和 npm：

```bash
git clone https://github.com/ThinkerQAQ/remote-browser-mcp.git
cd remote-browser-mcp
npm ci --no-audit --no-fund
npm run check
node scripts/client-smoke.mjs
npm run audit:high
```

`check` 运行单元与兼容性测试，`client-smoke.mjs` 验证离线 MCP 初始化与工具发现。Windows PowerShell 遇到脚本执行策略限制时，可以使用 `npm.cmd`。

代码变更通过 PR Review 和 Squash Merge 合入。安装包与正式版本的构建流程分别见 [Installer CI](.github/workflows/offline-installers.yml) 和 [Release CI](.github/workflows/release.yml)。

构建 Go 客户端：`cd client && go build -o ../bin/remotebrowsermcp .`。在 `client/` 运行 `go test ./...` 与 `go vet ./...`。`node scripts/client-smoke.mjs` 验证离线 MCP 初始化；`npm run proxy-smoke` 验证已授权浏览器中的专用测试页。

## 4. License

项目原创代码采用 [Apache-2.0](LICENSE)。Chrome DevTools MCP、MCP SDK 和 Tunnel 客户端保留各自许可证，具体见[第三方声明](THIRD_PARTY_NOTICES.md)。网站内容及用户文件不属于本项目源码许可范围。

**安全说明：**浏览器调试可以访问已登录的网站。代理默认保护已有标签页并限制工具，但仍需审查 MCP 权限并遵守网站的账户验证。MCP 请求和结果可能传输给连接的 AI 服务。9222 端口只允许本机使用，不要将原始 CDP 或未认证服务暴露到网络。不要把 `config.toml`、运行凭据、浏览器配置、Cookie、日志或快照提交到 Git。不使用时断开 MCP 或停止运行进程。安全漏洞可通过仓库的 [GitHub 私密漏洞报告](https://github.com/ThinkerQAQ/remote-browser-mcp/security/advisories) 私下提交，不要在公开 Issue 中发布凭据或私人网页数据。
