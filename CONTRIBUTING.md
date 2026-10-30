# Contributing / 参与贡献

[English](README.md) · [简体中文](README_ZH.md)

Create a branch from the latest `main` and open a pull request. Run `npm ci && npm run check` before submitting. This suite is offline and safe for CI. Real-browser smoke tests are optional, require your own Edge profile, and must not be executed on anyone else's authenticated session.

从最新 `main` 新建分支，通过 Pull Request 贡献。提交前运行 `npm ci && npm run check`。真实浏览器测试只能在自己的授权环境中执行；不要上传私密网页、Cookie、Token 或精确的个人环境路径。

For security bugs use the private reporting route in [SECURITY.md](SECURITY.md). Please avoid adding runtime credentials or hardcoded tunnel IDs to examples.
