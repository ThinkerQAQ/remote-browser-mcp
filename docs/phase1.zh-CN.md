# 阶段一：连接已有 Edge

[English](phase1.md) · [中文首页](../README_ZH.md)

## 环境

- Windows 原生 Node.js 22+
- 已运行的 Microsoft Edge
- 通过 `edge://inspect` 开启远程调试

## 运行

```powershell
npm ci
npm run doctor
npm run smoke
```

doctor 检测 CDP HTTP 和 WebSocket。
如果 HTTP 为 404 而 WebSocket 成功，仍可继续。
smoke 只列出标签页总数，不输出页面内容。

## 阶段一范围

- 使用官方 Chrome DevTools MCP 接入现有浏览器。
- 不重新启动 Edge，不主动切换窗口。
- 不保存 Cookie、Token 等浏览器会话数据。
- 独立 ChatGPT 远程隧道尚未注册；本地 MCP 代理已支持。
- 连接复用守护进程与远程鉴权属于下一阶段。

上游项目：[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)。
