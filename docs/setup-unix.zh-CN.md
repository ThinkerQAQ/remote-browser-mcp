# Linux 与 macOS 一键配置

[English](setup-unix.md) · [Windows](setup.zh-CN.md) · [中文首页](../README_ZH.md)

## 启动入口

下载[源码包](https://github.com/ThinkerQAQ/remote-browser-mcp/archive/refs/heads/main.tar.gz)，解压到长期使用的目录后启动：

| 平台 | 入口 |
| --- | --- |
| Linux | `sh setup.sh` |
| macOS | 双击 `setup.command`，或执行 `sh setup.sh` |
| Windows | 双击 `setup.cmd` |

也可下载并检查 [install.sh](https://raw.githubusercontent.com/ThinkerQAQ/remote-browser-mcp/main/install.sh)，运行 `sh install.sh`。它会下载源码到用户状态目录，并进入同一个向导。设置 `REMOTE_BROWSER_INSTALL_DIR` 可以选择其他空目录，不需要 Git 或 WSL。

需要安装 Node 时，启动脚本依赖 `curl`、`tar`、`awk` 和 SHA-256 工具（`sha256sum` 或 `shasum`）；解压隧道发行包还需要 `unzip`。这些系统基础工具缺失时，脚本会明确指出，由用户通过系统包管理器安装，不会静默执行 sudo。支持 Node.js 22+ 所支持系统版本上的 x64 和 ARM64。原生图形浏览器需要图形会话；这套脚本不会为纯服务器自动搭建远程桌面或 X 服务。

## 向导负责什么

统一入口复用 Node.js 22+ 和 npm，或安装用户目录专用 Node.js 24 LTS，校验官方 SHA-256 后安装项目锁定依赖。缺少 `tunnel-client` 时，下载对应平台的官方发行包，先验证摘要，再解压并检查命令支持，不替换系统已有版本。

向导引导个人隧道和工作区权限、隐藏输入运行密钥、浏览器选择、服务启动和 ChatGPT 注册。系统无法自动打开网页时，仍会打印公开账号页面地址。默认英文，中文系统自动使用中文，也可执行 `sh setup.sh --language zh-CN`。

Edge 和 Chrome 配置目录按各平台解析。如果已有运行中的浏览器调试配置，会复用 `DevToolsActivePort`。否则可**明确选择独立的浏览器配置目录**，使用本机 9222 端口调试，不会重启原有用户窗口。需要时在独立配置中登录网站一次，以后复用登录态。新版 Chrome 可能不允许调试默认用户配置，因此向导提供独立配置方案。端口被占用或浏览器启动失败时，会保留待完成状态。

一个隧道只能有一个活跃 stdio 客户端。跨平台迁移同一隧道前，先停止旧 WSL、Windows 或其他部署。Unix 原生别名为 `remote-browser-unix`；旧 WSL 继续使用原有别名和启动方式。

## 凭据与自启

| 环境 | 保存方式 | 登录自启 |
| --- | --- | --- |
| macOS | 系统钥匙串；通过标准输入传递密钥，不放在命令参数中 | 可选 LaunchAgent，仍受钥匙串和浏览器授权约束 |
| 有 `secret-tool` 和可用 D-Bus Secret Service 的 Linux 桌面 | 桌面密钥服务，通过标准输入写入 | 可选 systemd 用户级登录启动单元 |
| 无可用桌面密钥服务，或系统密钥服务失败 | scrypt 派生密钥、AES-256-GCM 认证加密文件，用户提供解锁口令 | 不启用无人值守自启，需要手动解锁 |

密钥和口令输入不回显，不进入 TOML、命令参数或配置报告。加密文件权限为 600，状态目录为 700；口令错误或文件被修改时拒绝解密，不保存固定或自动生成的解锁口令。

macOS 钥匙串和 Linux Secret Service 可能需要系统授权或解锁。只有系统密钥服务方案提供登录自启；退回口令加密文件时会移除本安装的自启配置。systemd 自启需要可用的用户会话，纯 SSH 环境可能不具备。自启只作用于当前用户和安装，不是系统级守护服务，也不保证登录时浏览器已经运行。

## 续配、检查和管理

```sh
# 继续配置，复用 TOML 选择和已保存的凭据方式。
sh setup.sh

# 只读预检，不下载、不询问密钥、不连接 CDP。
sh setup.sh --check

# 启动或复用 Unix 原生服务；加密文件方案会询问解锁口令。
sh setup.sh --start

# 仅停止本工具 Unix 服务。
sh setup.sh --stop

# 配置完成后查看三个布尔值的运行摘要。
npm run tunnel-status
```

非密钥选择保存在已被 Git 忽略的 `config.toml` 的 `[setup]`、`[browser]` 中。Linux 状态目录为 `${XDG_STATE_HOME:-$HOME/.local/state}/remote-browser-mcp`；macOS 为 `~/Library/Application Support/RemoteBrowserMCP`。浏览器配置、加密凭据和个人状态均属于私有数据，不要提交或公开。

浏览器检查读取持久代理自身的健康记录，不会由安装器再创建另一条 CDP 连接。浏览器或代理重启后仍可能需要重新授权。运行进程、浏览器健康和用户确认的 ChatGPT 实际调用分别记录；跳过 ChatGPT 验证会保留 `chatgpt_pending`，不会声称安装器自动完成了端到端验收。

CI 覆盖 Linux、Windows 和 macOS 原生运行器及 Node 22/24；Unix 测试包括凭据加解密、独立测试钥匙串中的真实 macOS 钥匙串操作、浏览器路径、自启定义、测试服务下的配置续配和验收状态。浏览器登录、原生授权对话框和真实系统重启，仍需要在用户环境验收，离线测试不替代这些结论。
