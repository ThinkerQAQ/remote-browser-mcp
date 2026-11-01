# Remote Browser MCP

[English](README.md)

## 项目简介

通过受控 Chrome DevTools MCP 代理操作自己的 Edge/Chrome 调试会话。支持专用后台标签页、默认保护已有用户标签页，并提供浏览器健康诊断。可直接连接本地 stdio 客户端，远程 ChatGPT 连接使用可选 OpenAI Tunnel。

## 快速开始

### 1. 前置条件

Node.js **22+**、npm、Git，以及 Windows、Linux 或 macOS 中的图形化 Edge/Chrome 会话。Windows 向导面向 Edge。浏览器调试需要你明确同意；只有 SSH 的无桌面机器不会自动获得图形浏览器。

### 2. 安装并开启调试

```sh
git clone https://github.com/ThinkerQAQ/remote-browser-mcp.git
cd remote-browser-mcp
npm ci
npm run check
```

Edge 打开 `edge://inspect`，为目标浏览器实例启用远程调试，出现授权提示时确认。默认端点为 `http://127.0.0.1:9222`。

如果浏览器没有此开关，可以关闭已有的专用测试配置实例，然后明确启动独立配置。例如 Linux 已安装 Google Chrome 时：

```sh
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.local/share/remote-browser-mcp-profile"
```

Windows/macOS 使用对应浏览器可执行文件，传入相同两个参数及固定的独立配置路径。新版 Chrome 可能拒绝对默认配置开启调试。不要将 9222 端口暴露到网络。

### 3. 配置并验证本地浏览器

默认端点上的 Edge 无需配置文件。使用 Chrome 或其他回环主机名时，在仓库目录创建 `config.toml`：

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

验收标准：CDP 就绪；冒烟检查创建 `about:blank` 标签页、读取快照、仅关闭该测试页，并以退出码 0 结束。已有用户标签页仍受保护。这是真实浏览器检查，离线单元测试不能代替。

### 4. 连接 MCP 客户端并使用

在客户端的 MCP 设置中添加本地 stdio 服务，替换实际绝对路径。Windows 使用正斜杠，例如 `C:/tools/remote-browser-mcp/scripts/launch.mjs`。

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

重新连接客户端，先调用 `browser_status`，确认 `cdp_ready=true`；再新建 `about:blank` 标签页、读取快照、关闭该页，完成客户端 → 代理 → 浏览器验收。客户端负责启动服务；`npm run mcp` 是排查协议时的手动 stdio 入口。

### 5. 常见问题

- **CDP 未就绪：**检查端点、浏览器进程、独立配置和授权弹窗。Tunnel 就绪不代表 CDP 就绪。
- **只有 `browser_status`：**上游工具发现失败。修复依赖或浏览器连接，重连、刷新工具并重新获取工具列表。
- **重复授权：**新代理进程或浏览器重启可能需要重新授权。状态探针会在进程内复用连接，但不会绕过浏览器或客户端授权。
- **已有页面被拒绝：**默认策略如此，请新建专用页面。
- **图形客户端找不到 Node：**使用 Node 的绝对路径。

## 配置说明

配置模板为 [config.example.toml](config.example.toml)，可选覆盖写入被 Git 忽略的 `config.toml`。`[browser].name` 默认 `edge`，`endpoint` 默认本机 9222。只接受回环地址的 9222 端口。`scripts/launch.mjs` 会先切换工作目录再加载代理，客户端无需设置 cwd。`[security].allow_existing_pages` 与 `allow_javascript` 均默认 `false`，开启会扩大访问权限。

向导在 `[setup]` 保存非敏感选项。runtime 密钥存放于 Git 之外：Windows DPAPI、macOS Keychain 或 Linux Secret Service。Linux 无可用密钥存储时使用口令加密文件，需要手动解锁，因此不启用无人值守启动。

## 可选功能

### 向导式远程 ChatGPT 接入

远程使用除了浏览器，还需要自己的 Tunnel / 工作区权限及 runtime 密钥。从 [Releases](https://github.com/ThinkerQAQ/remote-browser-mcp/releases/latest) 下载对应平台压缩包，解压到固定目录；Windows 运行 `setup.cmd`，Linux/macOS 运行 `sh setup.sh`，macOS 也可双击 `setup.command`。源码目录可使用相同入口。

向导安装受支持的 Node/npm 和官方 tunnel-client，指导配置浏览器、安全存储密钥、启动 runtime 并显示注册步骤。Unix 引导安装需要 curl、tar、awk、unzip 和 SHA-256 工具。操作浏览器需要图形会话；Windows 不需要 WSL。

在账户支持时，于 ChatGPT 完成「Add custom MCP server → Tunnel」，选择自己的 Tunnel。启用连接、刷新工具、新建聊天，调用 `browser_status`，然后完成前面的空白页流程。技能包能加载或 Tunnel 健康，不代表工具已发现或调用成功。

`npm run tunnel-status` 查看 runtime 状态。Unix 使用 `sh setup.sh --check`、`--start`、`--stop` 检查或管理进程；Windows 使用 `scripts/start-native.ps1`，停止时加 `-Stop`。可选登录启动依赖原生用户会话、凭据存储与浏览器授权。复用 Tunnel 前停止旧部署，避免多个 runtime 竞争。

仅已有 WSL 部署可在配置 Tunnel 后使用 `scripts/setup-wsl-service.sh install|status|remove` 管理旧版用户 supervisor；它不会启动 Edge，也不代表浏览器就绪。

## 开发与验证

```sh
npm ci
npm run check
npm run proxy-smoke
```

`check` 包含单元测试和安全策略测试；`proxy-smoke` 需要真实调试浏览器。CI 在 Windows、Linux、macOS 的 Node 22/24 环境运行离线测试与安装模拟，包括 Windows 原生安装和 macOS 隔离 Keychain 检查。账户注册、网站登录、原生弹窗、任意网站焦点行为和重启后的持续运行需要单独实测；后台操作为尽力保证。使用功能分支、PR 与 Squash Merge。

## 许可证与合规

原创集成代码采用 [Apache-2.0](LICENSE)，Chrome DevTools MCP 与 MCP SDK 保留各自许可，详见[第三方声明](THIRD_PARTY_NOTICES.md)和[安全说明](SECURITY.md)。浏览器调试可访问所选配置中已登录的页面，请求和结果可能进入所连接的 AI 服务。凭据、浏览器配置、runtime 状态与个人插件清单均应保密。源码许可不授予网站内容权利，也不代替网站访问授权。
