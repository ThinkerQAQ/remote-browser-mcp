# Remote Browser MCP

[English](README.md) · [安全说明](SECURITY.md) · [参与贡献](CONTRIBUTING.md) · [阶段一](docs/phase1.zh-CN.md) · [阶段二](docs/phase2.zh-CN.md)

通过 Chrome DevTools MCP 和可选的 OpenAI 持久隧道，让 AI 连接**已经运行的 Microsoft Edge 或 Google Chrome**。复用当前浏览器登录态，同时默认保护已有用户标签页。支持 Windows、Linux、macOS 原生配置，同时兼容旧 WSL2 方案，不另起无头浏览器。

> **实验性项目：** MCP 隧道显示健康，不等于 Edge 的 CDP WebSocket 可用。实际网站可能抢焦点，不能承诺绝对无干扰。

## 主要功能

- 连接本地 9222 调试端口；当 `/json/version` 异常时，尝试使用 `DevToolsActivePort` 中的 WebSocket。
- 借助 `tunnel-client` 维护持久 MCP 进程，无需每次操作都重新建立浏览器连接。
- 旧 WSL 部署可选用 systemd 用户服务自动恢复隧道，复用原有 Tunnel，不会重启 Edge。
- 强制后台新建标签页，并阻止 `select_page` 主动将窗口切到前台。
- 默认保护用户原有标签页；新增独立标签页仍可使用同一浏览器配置文件中的登录态。
- 固定工具白名单：默认不开放任意 JavaScript、文件上传、堆内存快照、原始网络请求，也不自动暴露新出现的上游工具。
- `browser_status` 只读检测 CDP 是否可用，不输出网页标题、URL 或登录凭据。
- TOML 示例配置，私有 `config.toml` 不参与 Git 提交。

## 一键配置（推荐）

**Windows：** `setup.cmd` · **Linux：** `sh setup.sh` · **macOS：** `setup.command` 或 `sh setup.sh`。详见 [Linux/macOS 指南](docs/setup-unix.zh-CN.md)与 [Windows 指南](docs/setup.zh-CN.md)。

下载[源码包](https://github.com/ThinkerQAQ/remote-browser-mcp/archive/refs/heads/main.zip)，解压到长期使用的目录，运行对应平台的入口。中英文向导负责安装项目依赖、安全保存凭据、启动服务和引导 ChatGPT 注册；账号登录和浏览器授权仍由本人完成。

## 手动启动（Windows PowerShell）

需要 Node.js 22+；在已有 Edge 的 `edge://inspect` 中开启远程调试。

```powershell
npm ci
npm run check
npm run doctor
npm run proxy-smoke
npm run mcp
```

`npm run proxy-smoke` 只打开 **about:blank 测试页**，验证权限与后台操作，再关闭该测试页。`npm run mcp` 启动受保护的本地 stdio MCP 服务，不会自动创建 ChatGPT 插件，也不会向公网开放 CDP。

## 接入 ChatGPT

按[阶段二指南](docs/phase2.zh-CN.md)配置个人专属 OpenAI 隧道，然后通过隧道 ID 创建**私有 ChatGPT 插件**。不要把个人隧道、运行密钥、浏览器配置文件或私有插件清单提交到公开仓库。优先调用 `browser_status` 验证 Edge，而非仅依赖隧道 `ready` 状态。

能加载 Skill 不代表已发现 MCP 工具。MCP 连接需要单独注册和验收，导入的 MCP 包可能受 Desktop only 限制，详见[注册与排查](docs/phase2.zh-CN.md#chatgpt-注册与验收)。上游工具发现失败时只提供 `browser_status`，恢复后需要刷新连接。

## 限制与安全

- 连接已配置的 Edge/Chrome 调试会话；Unix 向导可在明确选择后启动独立浏览器配置，不会静默重启用户窗口。
- 后台操作属于尽力保证；真实网站可能弹出原生对话框，改变窗口焦点。
- 隧道健康、浏览器 CDP 可用、ChatGPT 插件成功调用，是三个独立的验收项。
- 默认禁止操作原有用户标签页，必须明确修改配置才能开放。
- 浏览器调试权限可能访问已登录网站，请先阅读[安全说明](SECURITY.md)。

基于 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) 与 [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。本仓库**原创集成代码**采用 [Apache-2.0](LICENSE)；上游依赖保留各自许可证。具体版本及再分发义务参见[第三方声明](THIRD_PARTY_NOTICES.md)。
