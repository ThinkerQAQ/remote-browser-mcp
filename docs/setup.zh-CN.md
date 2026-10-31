# Windows 一键配置

[English](setup.md) · [中文首页](../README_ZH.md)

Linux 和 macOS 用户请使用[原生 Unix 配置指南](setup-unix.zh-CN.md)。

## 如何开始

下载仓库的[源码 ZIP](https://github.com/ThinkerQAQ/remote-browser-mcp/archive/refs/heads/main.zip)，解压到准备长期使用的目录，双击 **`setup.cmd`**。不要直接在压缩包查看器中运行，安装后不要移动或删除该目录。

也可以下载 [install.ps1](https://raw.githubusercontent.com/ThinkerQAQ/remote-browser-mcp/main/install.ps1)，通过 Windows PowerShell 启动。它会把源码下载到 `%LOCALAPPDATA%\RemoteBrowserMCP\app`，再进入同一个向导：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

安装器无需 Git、Linux、WSL，也不要求管理员账号。Windows 或公司的执行限制仍然有效；`Bypass` 仅作用于当前 PowerShell 进程，不修改系统执行策略。支持 Windows x64、ARM64 和 Microsoft Edge。若缺少 Edge，向导打开官方安装页，并保留配置进度。

## 向导负责什么

1. 复用 Node.js 22+，缺少时安装用户目录专用 Node.js 24 LTS，不替换系统版本；使用 Node 官方 SHA-256 清单校验下载。
2. 安装锁定版本的项目依赖；复用 Windows `tunnel-client`，或下载官方发行包并验证发布的 SHA-256 摘要。
3. 引导创建或选择个人隧道，输入完整隧道 ID，以及不回显的运行 API Key。下次运行复用已有选择。
4. 非密钥配置写入已被 Git 忽略的 `config.toml`。密钥在仓库外通过 Windows 用户绑定 DPAPI 加密保存，目录限制为当前用户访问。
5. 引导开启 Edge 调试，启动或复用本工具专属 Windows 托管进程。浏览器版本探针运行在持久代理中；向导读取本地检查结果，不再另起 CDP 连接。
6. 可选添加登录自启快捷方式，使用已加密的凭据启动本工具。浏览器或代理重启后，Edge 仍可能要求新的授权。
7. 打开 ChatGPT 插件页，仅复制隧道 ID，明确引导「添加自定义 MCP 服务器 → 隧道」；最后要求确认实际 `browser_status` 调用结果。

“一键”指统一入口和引导式配置，不会绕过账号权限或安全授权。Platform 登录、创建隧道及关联工作区、Edge 授权、ChatGPT 连接仍需本人完成。向导不会代建 OpenAI 账号，也不会要求把密钥粘贴到聊天里。Secure MCP Tunnel 仍要求隧道访问权限与运行密钥；工具本身不会发起模型 API 调用。

## 继续配置与管理

再次双击 `setup.cmd`。向导复用依赖、路径和加密密钥，不重复创建健康的本地服务。浏览器验收失败时，修复 Edge 调试配置后重新运行，向导会重启本工具的 Windows 服务以重新授权。如果移动安装目录，应先关闭旧安装的登录自启，再配置新位置。

```powershell
# 只读预检：不下载、不询问密钥、不连接浏览器、不修改自启。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -CheckOnly

# 指定中文
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -Language zh-CN

# 运行状态摘要，只输出三个布尔值
npm run tunnel-status

# 启动或复用、仅停止本工具 Windows 服务
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native.ps1 -Stop
```

Windows 原生运行使用 `remote-browser-native` 别名和配置。旧 WSL 方案继续使用 `remote-browser` 和[阶段二命令](phase2.zh-CN.md)。**同一隧道迁移到 Windows 前，必须先停止旧 WSL 或其他客户端。** 同一 stdio 隧道只能运行一个活跃客户端；向导不会静默停止其他部署或修改其他项目。

## 保存内容与验收标准

| 文件或组件 | 用途 |
| --- | --- |
| 安装目录 `config.toml` | 浏览器、安全配置及 `[setup]` 非密钥选择；保留已有设置 |
| `%LOCALAPPDATA%\RemoteBrowserMCP\state\runtime-key.dpapi` | 绑定当前 Windows 用户和机器的加密凭据；不在 TOML 或命令参数中保存明文密钥 |
| 同一个 `state` 目录 | 依赖缓存、私有诊断日志、浏览器健康和配置报告 |
| Windows 启动目录快捷方式 | 可选登录自启，按安装路径生成独立名称 |

不要上传私有配置、密钥、浏览器资料或状态目录。DPAPI 凭据无法直接迁移到其他 Windows 用户或机器，需要在那里重新输入密钥。删除运行状态前先停止本工具。登录自启不是始终在线服务：电脑需要开机，用户需要登录。

`setup-report.json` 区分依赖、账号、浏览器、运行进程步骤，以及 `browser_pending`、`chatgpt_pending`、`complete_user_confirmed`。隧道健康不会自动标记 ChatGPT 验收通过；最后一步明确属于**用户确认结果**，不会伪称安装器已自行调用 ChatGPT。跳过确认则保留待完成状态。

测试覆盖真实 Windows PowerShell 执行、DPAPI 凭据加解密、带空格的路径、重复运行复用服务，以及待完成状态；隧道侧使用离线测试程序。开发环境另行实测了真实注册、后台网页操作、Chat/Work 调用；全新账号的授权及真实重启后的登录自启不属于离线测试结论。
