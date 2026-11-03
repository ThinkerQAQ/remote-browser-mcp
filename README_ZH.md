# RemoteBrowserMCP

[English](README.md)

- [1. Introduction](#1-introduction)
- [2. Quick Start](#2-quick-start)
- [3. Development](#3-development)
- [4. License](#4-license)

## 1. Introduction

最开始开发 RemoteBrowserMCP，是因为我想直接在网页版 ChatGPT 里，让它帮我操作自己电脑上的浏览器，例如查看网页、整理资料，或者填写表单。

ChatGPT 可以根据链接、文字和截图分析问题，但要让它在我自己的浏览器里打开页面、点击按钮，并接着完成后续操作，还需要一套能够连接本地浏览器的工具。对于已经登录的网站，我也希望它能在获得授权后复用浏览器中的登录状态，减少来回复制内容和手动操作。

RemoteBrowserMCP 就是为此而做的。它通过 MCP 提供浏览器操作能力，再使用 OpenAI Secure MCP Tunnel 将运行在本机的工具连接到网页版 ChatGPT。本机主动建立 Tunnel 连接，无需将浏览器的调试端口暴露到公网。

连接后，你可以直接在对话中描述任务，让 ChatGPT 在已授权远程调试的 Edge 或 Chrome 中读取页面、点击和输入。项目默认保护原来打开的标签页，并优先在独立的后台标签页中操作，尽量减少对日常浏览的打扰；同一个 MCP 进程也会复用浏览器连接，避免每次操作都重新连接。

项目提供 Windows、Linux 和 macOS 安装包，以及共用一套逻辑的图形界面和命令行。安装后配置 Tunnel、开启浏览器调试，再在 ChatGPT 中注册插件，就可以从网页版 ChatGPT 连接并操作自己的浏览器。也可以将这些工具接入其他支持 MCP 的本地客户端。

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

填写 Tunnel ID 和 Runtime API Key，点击**保存**，再点击**启动服务**。页面会自动检测状态，等待右上角显示 **Tunnel 已就绪**。服务运行时修改并保存配置后，点击**重启服务**使其生效。已保存的密钥显示星号占位，留空即可复用。

连接页面提供两个独立偏好：

- **本地服务开机自启动**：为当前安装注册真实的系统启动项。Windows 使用当前用户的低权限交互式登录任务，不保存系统账户密码；Linux 使用 systemd 用户单元；macOS 使用 LaunchAgent。已有原生服务安装继续使用原服务管理器，修改其启动设置。保存不会启动或停止当前服务。需要可用的用户会话和启动项管理权限，注册失败会明确报错，不会显示为保存成功。
- **Tunnel 自动连接**：决定本地服务启动后是否连接已保存的 Tunnel。已有安装默认保持开启。关闭后服务启动时处于待命状态，可点击**连接 Tunnel**或**断开 Tunnel**操作当前连接，不改变此偏好。保存的连接配置和自动连接偏好通过重启服务生效。

**停止服务**仅停止本次运行（包括 Tunnel），保留两个偏好；若自启动仍开启，下次登录会再次启动。关闭自启动不会停止当前服务。macOS 新启用的 LaunchAgent 在下次登录时加载，立即运行请点击**启动服务**。Linux 用户服务通常在登录后启动，本客户端不会自动启用 lingering；Windows、macOS 的浏览器访问同样使用用户登录会话。

命令行对应操作如下，Windows 请替换为对应的可执行文件路径：

```sh
./bin/remotebrowsermcp configure --id tunnel_EXAMPLE --autostart=true --auto-connect=false
./bin/remotebrowsermcp start
./bin/remotebrowsermcp connect
./bin/remotebrowsermcp disconnect
```

示例复用已保存的密钥；首次配置还需传入 `--api-key-stdin`。未传入的偏好参数保持原值。`status` 查询实际系统启动项状态，系统接口不可用不会显示成已开启。注册失败时恢复原连接文件，并尝试恢复原系统注册状态。

升级请保留原安装目录，通过维护/更新流程替换程序，保留 `config.toml`、`runtime/`、浏览器配置目录和用户数据。自启动与自动连接偏好保存在私有 `runtime/setup.json`，Tunnel ID 同样保留；密钥继续保存在私有 `runtime/credentials.json`。安装包不包含这些文件和数据目录。移动安装位置会改变启动项身份，移动前先关闭旧位置的自启动，在新位置重新开启。卸载前请先关闭自启动并停止服务（显式安装的原生服务则先卸载服务），再移除应用。


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
