# Third-party notices / 第三方依赖声明

The Apache-2.0 license in [LICENSE](LICENSE) applies to the original Remote Browser MCP integration code in this repository. It does not replace the licenses of third-party dependencies.

本仓库原创集成代码采用 Apache-2.0；第三方依赖仍遵循各自许可证，本项目许可证不覆盖它们。

## Direct npm dependencies / 直接 npm 依赖

Versions and license identifiers below are taken from the committed `package-lock.json`. They are checked against that lockfile by `tests/third-party-notices.test.mjs`.

| Package | Locked version | License | Upstream |
| --- | --- | --- | --- |
| `chrome-devtools-mcp` | `1.12.0` | `Apache-2.0` | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) |
| `@modelcontextprotocol/sdk` | `1.32.2` | `MIT` | [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| `smol-toml` | `1.9.1` | `BSD-3-Clause` | [smol-toml on npm](https://www.npmjs.com/package/smol-toml) |

The MCP SDK identifier above is for the **locked 1.32.2 package**; upstream may use different terms for newer contributions. Always confirm the license in the exact package/version being redistributed.

以上 MCP SDK 的许可证对应**锁定的 1.32.2 包**，不代表所有后续版本均采用同一许可；再分发时须以具体版本为准。

## Optional external transport / 可选外部传输工具

- [`openai/tunnel-client`](https://github.com/openai/tunnel-client) — `Apache-2.0`. This is installed and run separately by the operator; its source and executable are **not** part of this repository. Its own license and distribution notices apply.

## Redistribution / 再分发要求

- `npm ci` obtains dependencies from their upstream packages. This repository does not vendor the source of Chrome DevTools MCP or the MCP SDK.
- The table is a **direct-dependency inventory, not a complete transitive-license report**. When distributing `node_modules`, an executable bundle, an installer with embedded dependencies, or a container image, preserve the applicable full license texts, copyright notices, and any required NOTICE files for **all shipped components**. Generate a version-specific inventory from the actual release artifact.
- Merely linking to upstream projects here is **not a substitute** for shipping legally required license texts in a bundled release.
- Product names and trademarks belong to their respective owners. No affiliation with or endorsement by Chrome DevTools, the MCP project, or OpenAI is implied.

- `npm ci` 从上游安装依赖；本仓库不内嵌 Chrome DevTools MCP 或 MCP SDK 源码。
- 本表**只覆盖直接依赖，并非完整的传递依赖许可证清单**。若发行包包含 `node_modules`、打包的可执行文件或内嵌依赖，须按**实际发行产物**保留所有适用的完整许可证、版权声明与 NOTICE 文件。
- 本文件提供的上游链接**不能替代**发行包中依法需要附带的许可证文本。
- 第三方名称和商标归各自权利人所有，不表示存在官方合作或背书。
