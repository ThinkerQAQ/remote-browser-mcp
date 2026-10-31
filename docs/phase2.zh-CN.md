# 阶段二：安全代理与远程隧道

[English](phase2.md) · [中文首页](../README_ZH.md)

Windows 新用户优先使用[一键配置向导](setup.zh-CN.md)，下文 WSL 命令继续用于既有部署。


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

通过 `tunnel-client runtimes status remote-browser` 检查托管进程健康状态，然后按下文完成注册和验收。不要将个人插件清单上传到仓库。

## 默认安全规则

- 不开放公网 CDP 9222；远程连接只通过已认证的 OpenAI 隧道。
- 强制新标签页后台打开、禁止自动前置。
- 默认禁止操作已有用户标签页、上传文件、任意 JS 与原始网络请求读取。
- 新标签页仍共享 Edge 网站登录态，因此 AI 可能看到页面内的私密信息，必须谨慎授予访问权限。
- 仅对只读 `list_pages` 进行连接失败后的重试，避免重复执行具有副作用的操作。
- 已验证 `about:blank` 不抢占前台窗口，真实网站仍需单独测试。

通过只读 `browser_status` 检查浏览器 CDP 是否真正可用；隧道 `ready` 不能替代此项。Edge 出现「受自动测试软件控制」提示属于调试模式的正常现象。

## 运行日志

执行 `tunnel-client runtimes status remote-browser --json`。私有启动状态和 Node 错误日志位于 `~/.local/state/remote-browser-mcp/`，不要上传。

## ChatGPT 注册与验收

隧道运行、Skill 打包和 ChatGPT MCP 连接可用，是独立的完成条件。通过 Plugin Creator 创建插件包，不能证明 ChatGPT 已发现服务端工具。

官方文档中的直接连接流程为：

1. 用 MCP Inspector 验证本地初始化和 `tools/list`，确认包含 `browser_status`。上游初始化或工具发现失败时，代理只提供 `browser_status`；上游初始化和工具列表请求各设五秒超时。修复上游后重新请求 `tools/list`。
2. 在 ChatGPT 插件中选择「添加自定义 MCP 服务器 → 隧道」，使用已有专属隧道完成连接，核对实际发现的工具。连接失败时检查账号、工作区访问权限与隧道归属。
3. 安装、启用生成的插件，在新对话中先调用 `browser_status`，再验证独立后台测试页，逐项记录结果。
4. 若需要围绕已有 App 打包 Skill，通过 `.app.json` 引用已注册 App 的 ID。该文件不会注册 App，也不会赋予访问权限。填写 App ID，不能填写插件页面 ID；例如 `plugin_asdk_app_example` 对应 App `asdk_app_example`。

导入包在 `mcp.json` 或 `.mcp.json` 中直接声明 MCP 时，可能被标记为 **Desktop only**，网页端无法使用，即使声明的是远程 HTTPS 服务。只增加 `.app.json` 不会自动消除该标记。应先检查实际插件元数据和支持的运行端，再选择打包方式。能读取 Skill，不能证明 MCP 工具已加载。

服务端工具元数据变更后，重启服务，在 ChatGPT 插件中刷新直接连接，确认发现的工具，再创建新对话。如果此前只发现了诊断工具，上游恢复后需要再次刷新，加载浏览器工具。

## 按层排查

| 现象 | 检查位置 | 通过证据 |
| --- | --- | --- |
| 隧道停止 | 托管进程状态与私有启动、错误日志 | 进程运行且隧道连接 |
| 隧道 ready，但浏览器不可用 | `browser_status` 或 `npm run doctor` | `cdp_ready=true` 或 `CDP_READY=true` |
| 只发现 `browser_status` | 上游 MCP 启动、依赖和本地配置；修复后重新发现 | 刷新的 `tools/list` 包含浏览器工具 |
| Skill 可读取，但没有 MCP 工具 | App 注册连接、实际工具列表、包声明、Desktop only 标记及运行端 | 目标对话实际调用工具成功 |
| `@` 找不到插件 | 账号、工作区、安装启用状态、支持的运行端及新对话 | 能选中插件并调用工具 |
| 反复弹授权 | 区分 DV/终端、ChatGPT MCP 与 Edge CDP 的授权来源 | 单独记录对应授权层 |

多个接口返回矛盾状态时，不应仅凭一个安装状态字段断定未安装。持久连接复用传输，不会绕过运行端或工具的授权规则。排查注册、发现问题时，避免反复打开网页或启动更多 CDP 客户端。

首次接入中观察到的注册结构不匹配，在修复后的连接完成端到端实测前，仍属于**待验证的部署诊断**。工具发现降级修复解决的是诊断入口可用性，不会自动修复 Edge CDP 或注册 App。

官方参考（核对于 2026-10-30）：[连接与测试](https://developers.openai.com/plugins/deploy/connect-chatgpt)、[插件管理与 App 引用](https://learn.chatgpt.com/docs/enterprise/plugin-management)。

## 为什么两个创建入口结果不同

| 入口 | 负责什么 | 网页版 ChatGPT |
| --- | --- | --- |
| 添加自定义 MCP 服务器 → 隧道 → 创建为插件 | 注册远程 App、发现服务端工具，再连接安装 | 本项目已经实测通过的接入路径 |
| 创建插件 / Plugin Creator | 打包 Skill、资源及 MCP/App 引用 | 插件包本身不等于完成远程 App 注册；直接声明 MCP 可能受 Desktop only 限制 |

两个入口最终都可能在界面中叫“插件”。关键区别是**连接注册与能力打包**，不能归纳为“MCP 可以、插件不行”。先注册并测试 MCP 连接，再按需用已注册 App 引用添加 Skill 包装；不能把压缩包中声明隧道等同于注册网页端 App。参见[官方打包文档](https://developers.openai.com/plugins/build/plugins)。

## 本地运行进程停止后的恢复

在已经配置运行密钥的原始 WSL 环境中执行：

```sh
sh scripts/setup-tunnel.sh tunnel_YOUR_EXISTING_ID
npm run tunnel-status
```

复用已有隧道。`setup-tunnel.sh` 明确传入 `--tunnel-id` 和运行密钥引用，不需要管理权限创建资源。直接执行不带隧道 ID 的 `runtimes connect`，可能选中管理配置并因缺少 `OPENAI_ADMIN_KEY` 失败。从 Windows 新开的 WSL 子进程也可能没有继承原始 WSL 环境中的运行密钥。不要将密钥复制到聊天、仓库或命令参数中。状态命令只输出三个布尔值，运行状态不就绪时返回失败；浏览器健康仍需单独检查。

### WSL 旧部署的可选自动恢复

使用旧版 **WSL → Windows Node.js** 链路时，MCP 子进程的 stdio 出现 EOF 可能导致整个 `tunnel-client` 退出；仅使用原来的别名启动并不能保证退出后自动重启。首次通过 `setup-tunnel.sh` 建立 `~/.config/tunnel-client/remote-browser.yaml` 后，可注册用户级 systemd 守护服务：

```sh
sh scripts/setup-wsl-service.sh install
sh scripts/setup-wsl-service.sh status
# 不再需要时卸载：
sh scripts/setup-wsl-service.sh remove
```

脚本要求可用的 `systemctl --user` 会话、已有的私有隧道配置及 `~/.config/tunnel-client/runtime.env`。密钥只从本地环境文件加载，不写入生成的 service 文件或仓库。安装时会先停止**旧托管别名进程**，避免两个客户端竞争同一隧道；服务已运行时重复安装不会重启 Edge 或中断长连接。服务正常运行期间，`setup-tunnel.sh` 会阻止重复启动第二个托管运行时。

服务采用 `Restart=always`，每五分钟最多启动三次。自启仍受 WSL 是否运行、systemd 用户管理器是否可用影响（`loginctl show-user "$USER" -p Linger`），并不保证 Windows 开机后 WSL 一定自行启动。该服务**不启动或重启 Edge、不跳过授权，也不代替 `browser_status` 和实际只读工具验收**。2026-10-31 已确认的直接故障为 MCP stdio EOF，子进程究竟为何关闭尚无充分证据。

Windows 原生、Linux 原生和 macOS 用户仍应使用各平台的安装向导；这个守护脚本只服务于旧 WSL 部署。

## 注册报错与实测结果

2026-10-31 接入时，本地隧道停止，界面显示“应用配置受到速率限制”。创建请求实际返回 HTTP 424，详情包含 `upstream_status=429` 和 MCP 隧道网关探测失败。这能定位失败层，但不能据此断定网关限流的具体原因。先恢复运行进程，待限制解除后单次重试，不要连续创建 App 或隧道。

恢复运行进程后，创建接口返回 HTTP 200，直接注册的 MCP App 出现在“已安装”中。新建 ChatGPT 聊天实际调用 `browser_status`，报告 `cdp_ready=true`。本地 MCP 验收发现 27 个工具，后台创建 `about:blank`、读取快照、关闭测试页均通过，原有用户标签页仍受保护。这是指定环境在测试时的结果，不代表所有网站和以后每次重启都保证通过。个人 App、隧道 ID 及会话日志不进入仓库。

## Edge 授权与健康探针复用

已有 CDP 连接可以继续工作，而新建 WebSocket 可能停在 Edge 的 **Allow remote debugging?** 授权弹窗。原健康探针每次调用都新建并关闭连接，会重复触发授权，即使已有连接正常，也可能因等待授权超时而误报。现在 `browser_status` 在同一代理进程内复用一条浏览器版本检测 WebSocket，合并并发探测，仅在连接关闭、失败或端点变化后重连，探测超时为十秒。它只调用 `Browser.getVersion`，不读取用户标签页。

代理进程或浏览器重启后仍可能需要重新授权。健康探针与上游自动化客户端各自维护连接；长连接复用和隧道健康都不会取消 Edge 或 ChatGPT 的授权要求。Work 能发现已注册 App，也可能在实际探测时返回 false，需要把授权、CDP 健康与 App 注册分别排查。
