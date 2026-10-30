# 阶段二：安全代理与远程隧道

[English](phase2.md) · [中文首页](../README_ZH.md)

## Windows 本地测试

在 PowerShell 执行 `npm ci`、`npm run doctor`、`npm run proxy-smoke`。测试仅新建 `about:blank` 标签页，验证权限、读取快照并清理测试标签页。`npm run mcp` 启动带保护的 MCP stdio 服务。

## WSL 连接测试

在项目根目录执行 `node scripts/interop-smoke.mjs`，通过 `scripts/launch-from-wsl.sh` 调用 Windows Node，验证同一 MCP 进程连续处理两次请求。

## OpenAI 独立持久隧道

先在 [OpenAI 隧道设置](https://platform.openai.com/settings/organization/tunnels) 创建新的专用隧道。不要复用 BlogCTL 或 Wardrobe 的隧道。创建需要账号具备管理权限；现有运行密钥无法直接创建。

创建后，在 WSL 环境配置好 `CONTROL_PLANE_API_KEY`，执行：

```sh
sh scripts/setup-tunnel.sh tunnel_YOUR_NEW_ID
```

通过 `tunnel-client runtimes status remote-browser` 检查托管进程健康状态，再通过 Plugin Creator，或「插件 → 添加 → 添加自定义 MCP 服务器 → 隧道」创建私有插件，不将个人插件清单上传到仓库。

## 默认安全规则

- 不开放公网 CDP 9222；远程连接只通过已认证的 OpenAI 隧道。
- 强制新标签页后台打开、禁止自动前置。
- 默认禁止操作已有用户标签页、上传文件、任意 JS 与原始网络请求读取。
- 新标签页仍共享 Edge 网站登录态，因此 AI 可能看到页面内的私密信息，必须谨慎授予访问权限。
- 仅对只读 `list_pages` 进行连接失败后的重试，避免重复执行具有副作用的操作。
- 已验证 `about:blank` 不抢占前台窗口，真实网站仍需单独测试。

通过只读 `browser_status` 检查浏览器 CDP 是否真正可用；隧道 `ready` 不能替代此项。Edge 出现「受自动测试软件控制」提示属于调试模式的正常现象。

## 启动诊断

插件无法通过 `@` 找到时，先确认它在 ChatGPT 中已安装；创建成功不等于安装。然后执行 `tunnel-client runtimes status remote-browser --json` 查看托管运行状态。私有启动状态与 Node 错误日志保存在 `~/.local/state/remote-browser-mcp/`，不要上传这些文件或公开访问。隧道健康、插件安装状态和 Edge CDP 授权分别检查，不能相互替代。
