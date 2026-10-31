# Security / 安全

Report vulnerabilities privately through GitHub Security Advisories; **do not publish credentials, site contents, screenshots or exploit details in an issue**. 通过 GitHub Security Advisories 私密报告漏洞；勿在公开 Issue 中提交凭据、网页内容、截图或利用细节。

This MCP can act with your browser's **existing authenticated session**. Connecting it to an AI agent effectively delegates browsing privileges. Treat access to a local browser as sensitive, and review tool permissions before use. MCP plugin permission prompts and website account verification still apply.

## Defaults

- Only loopback CDP (`http://127.0.0.1:9222`) is supported. Never expose port 9222 to the public internet.
- A dedicated new tab is always created in the background. Existing tabs are hidden and cannot be controlled by default.
- Arbitrary JavaScript, file upload, raw network requests, and heap snapshots are disabled by default. New upstream tools are not automatically exported.
- Real websites may show popups or change focus. The non-stealing-focus result is **best effort**, verified only for the smoke test.
- Keep your OpenAI Tunnel ID and API credentials out of public repositories. Never commit a `config.toml`, cookies, login tokens, browser profiles, or session snapshots.
- Disable the plugin or stop its tunnel when not needed; keep Edge updated.

This repository contains no preconfigured tunnel or ChatGPT user plugin. Every operator must create their own secure tunnel and explicit authorization. / 本仓库不附带作者隧道 ID、ChatGPT 私人插件或登录凭据，用户需自行配置并授权。

## Repository and dependency maintenance / 仓库与依赖维护

- Changes to `main` go through a pull request and required CI checks. Use Squash Merge; merged source branches are automatically deleted. / 主分支修改通过 PR 和必需的 CI 检查，使用 Squash Merge，合并后自动删除来源分支。
- Dependabot checks npm dependencies weekly. Run `npm audit --omit=dev --audit-level=high` when reviewing dependency updates; resolve high/critical findings before merging. / Dependabot 每周检查 npm 依赖；更新时运行上述审计，合并前处理高危和严重漏洞。
- The 2026-10-31 maintenance update pins `smol-toml` to 1.9.1, resolving the malformed-document and parser-complexity denial-of-service advisories affecting 1.6.0. Keep the lockfile with the update. / 2026-10-31 将 `smol-toml` 固定到 1.9.1，修复 1.6.0 涉及的畸形文档与解析复杂度拒绝服务漏洞，并同步锁文件。
