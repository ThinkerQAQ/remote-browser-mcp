# Remote Browser MCP

[English](README.md) · [阶段一说明](docs/phase1.zh-CN.md)

连接**已经运行的 Microsoft Edge** 的 Chrome DevTools MCP 最小集成项目。不会主动启动、重启 Edge，也不会切换焦点。

## 快速开始（Windows PowerShell）

```powershell
npm ci
npm run doctor
npm run smoke
```

要求 Node.js 22+，Edge 已启用远程调试。doctor 检测 CDP HTTP 端点与 `DevToolsActivePort` 中的 WebSocket 地址；smoke 连接官方 MCP，只调用只读的 `list_pages`。

## 当前范围

- **阶段一：** 复用 Edge、CDP 诊断、官方 MCP 接入、只读冒烟测试。
- **尚未实现：** ChatGPT HTTPS 网关、跨会话持久连接、重连守护进程、绝对不抢焦点保证。
- 不保存或输出浏览器 Cookie、Token、用户网页 URL 或标题。

见[安装与故障排查](docs/phase1.zh-CN.md)。禁止将 CDP 端口暴露到公网。
