# Phase 2 — Safe proxy and remote tunnel

[简体中文](phase2.zh-CN.md) · [README](../README.md)

New Windows users should start with the [one-entry setup wizard](setup.md). The WSL commands below remain available for existing deployments.


## Local test (Windows)

Run `npm ci`, `npm run doctor`, then `npm run proxy-smoke` in PowerShell. The smoke test opens only `about:blank`, verifies protected tools, takes a snapshot and closes that test tab. `npm run mcp` starts the protected MCP stdio server.

## WSL interop

From this repository in WSL, run `node scripts/interop-smoke.mjs`. This launches the Windows Node runtime through `scripts/launch-from-wsl.sh` and verifies two sequential MCP requests.

## Persistent OpenAI tunnel

Create a **new, dedicated tunnel** in [OpenAI tunnel settings](https://platform.openai.com/settings/organization/tunnels). Do not reuse existing application tunnel IDs. This requires account access with tunnel-management permissions. The local runtime key alone cannot create tunnels.

After you have a new tunnel ID, with `CONTROL_PLANE_API_KEY` available in the WSL environment, run:

```sh
sh scripts/setup-tunnel.sh tunnel_YOUR_NEW_ID
```

Verify `tunnel-client runtimes status remote-browser`, then follow the registration and acceptance steps below. Keep user-specific plugin manifests out of this repository.

## Default safety policy

- No raw Chrome CDP listener is exposed publicly; only an authenticated OpenAI tunnel is intended.
- `new_page` always uses `background=true`, `select_page` forces `bringToFront=false`.
- Original user tabs cannot be selected, navigated or closed in default configuration; raw network requests, file upload, heap snapshots and arbitrary JavaScript are not offered.
- A dedicated background tab shares the Edge profile's site login state. A trusted MCP client can still encounter sensitive page content; grant access carefully.
- Transport reconnect is attempted for failed read-only `list_pages` requests, not for potentially side-effecting actions.
- Only `about:blank` focus behavior has been verified. Other site behavior may differ.

Use the read-only `browser_status` tool to diagnose CDP readiness. The tunnel can be ready while Edge remote debugging is disabled or unresponsive. An Edge banner stating that it is controlled by automated software is expected when debugging is active.

## Runtime logs

Run `tunnel-client runtimes status remote-browser --json`. Private launch status and Node error logs are under `~/.local/state/remote-browser-mcp/`; do not upload them.

## ChatGPT registration and acceptance

A running tunnel, a packaged skill and a working ChatGPT MCP connection are separate milestones. Creating a plugin archive with Plugin Creator is not evidence that ChatGPT has discovered its tools.

For the documented direct connection flow:

1. Verify local MCP initialization and `tools/list` with MCP Inspector. `browser_status` must be present. If the browser upstream fails to initialize or list tools, the proxy exposes only `browser_status`; upstream initialization and listing each have a five-second request timeout. Recover the upstream, then request `tools/list` again.
2. In ChatGPT Plugins, choose Add custom MCP server → Tunnel, select your existing dedicated tunnel and complete the connection flow. Review the tools actually discovered. Check account/workspace access and tunnel association if connection fails.
3. Install/enable the resulting plugin and test it in a new conversation. Call `browser_status` first, then verify a dedicated background test tab. Record each result separately.
4. If packaging skills around an existing app, use `.app.json` to reference the registered app ID. This file does not register an app or grant access. Use an app ID, not the plugin page ID; for example, `plugin_asdk_app_example` refers to `asdk_app_example`.

Imported bundles that declare MCP servers in `mcp.json` or `.mcp.json` can be marked **Desktop only** and unavailable on the web, including with remote HTTPS servers. Adding `.app.json` alone does not remove that label. Check the actual plugin metadata and supported host before choosing a packaging route. Skill availability alone does not prove tool availability.

After changing server tool metadata, restart the server, refresh the direct MCP connection in ChatGPT Plugins, confirm the discovered tools, and start a new conversation. If discovery previously exposed only diagnostics, refresh again after upstream recovery to load the browser tools.

## Troubleshooting by layer

| Symptom | Check | Acceptance evidence |
| --- | --- | --- |
| Tunnel is stopped | Runtime status and private launch/error logs | Process running and tunnel connected |
| Tunnel is ready, but browser fails | `browser_status` or `npm run doctor` | `cdp_ready=true` or `CDP_READY=true` |
| Only `browser_status` is discovered | Upstream MCP startup, dependencies and local configuration; retry discovery after repair | Browser tools appear in refreshed `tools/list` |
| Skill loads, but no MCP tools | Registered app connection, actual discovered tools, bundle declarations, Desktop only label and host | A real tool call succeeds in the target conversation |
| Plugin is missing from `@` | Account/workspace, installation/enabling, supported host and a new conversation | Plugin selected and tool called |
| Repeated approval prompts | Which tool/host requests approval: DV/terminal, ChatGPT MCP, or Edge CDP | Record that approval layer separately |

Do not treat a single installation-status field as conclusive when other interfaces disagree. A persistent transport reuses a connection; it does not bypass host/tool approval policy. Avoid diagnosing tool-registration failures by repeatedly opening tabs or starting more CDP clients.

The registration mismatch observed during initial setup remains an **unverified deployment diagnosis** until the repaired connection is exercised end to end. The discovery fallback fixes diagnostic availability; it does not repair Edge CDP or register an app automatically.

Official references (checked 2026-10-30): [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Plugin management and app references](https://learn.chatgpt.com/docs/enterprise/plugin-management).

## Why the two creation entries differ

| Entry | Responsibility | Browser-based ChatGPT |
| --- | --- | --- |
| Add custom MCP server → Tunnel → Create as a plugin | Register the remote app, discover server tools, then connect/install | The verified route for this project |
| Create plugin / Plugin Creator | Package skills, assets and server/app references | A bundle alone does not establish a registered remote app; direct MCP declarations may be Desktop only |

Both routes ultimately produce something called a plugin in the UI. The distinction is **registration versus packaging**, not MCP versus plugins. First register and test the MCP connection. Add an optional skill wrapper afterward using the registered app reference; do not assume a tunnel declaration in an archive registers the same web app. See [official packaging guidance](https://developers.openai.com/plugins/build/plugins).

## Recovery after the local runtime stops

Run these in the original WSL environment where the runtime key is configured:

```sh
sh scripts/setup-tunnel.sh tunnel_YOUR_EXISTING_ID
npm run tunnel-status
```

Reuse the existing tunnel. `setup-tunnel.sh` passes `--tunnel-id` and a runtime key reference so it does not need admin CRUD credentials. A bare `runtimes connect` can select an admin profile and fail on a missing `OPENAI_ADMIN_KEY`. A newly launched Windows → WSL child may not inherit the original WSL runtime-key environment. Do not copy keys into chat, source control or command arguments. The status command prints only three booleans and fails if the runtime is not ready; browser health must still be checked separately.

Managed runtime supervision does not prove startup after a Windows/WSL shutdown. Check it after reboot before registering or testing an app. Automatic boot startup has not been verified.

## Registration errors and verified acceptance

On 2026-10-31, the UI displayed an app-configuration rate-limit error while the local tunnel was stopped. The registration request returned HTTP 424, with `upstream_status=429` and an MCP tunnel gateway probe failure. This identifies the failing layer; it does not establish why the gateway rate-limited the probe. Restore the runtime first and allow any limit to clear before one controlled retry; do not repeatedly create apps or tunnels.

After restoring the runtime, registration returned HTTP 200 and the direct MCP app appeared under Installed. A new ChatGPT chat called `browser_status` and reported `cdp_ready=true`. Local MCP acceptance discovered 27 tools and passed background `about:blank` creation, snapshot and cleanup. Existing user tabs remained protected. This is a point-in-time result for the tested environment, not a guarantee for every website or future restart. Keep personal app/tunnel IDs and session logs outside the repository.

## Edge authorization and health-probe reuse

A live CDP connection can keep working while a new WebSocket waits for Edge's **Allow remote debugging?** consent. The original health probe opened and closed a socket on every call, causing repeated consent requests and false-negative timeouts even while an existing connection was healthy. `browser_status` now reuses one browser-version WebSocket per proxy process, coalesces concurrent probes and reconnects only after closure/failure or an endpoint change. Its probe timeout is ten seconds. It only calls `Browser.getVersion` and does not read user tabs.

A new proxy process or browser restart can still require fresh Edge consent. The health probe and the upstream automation client maintain separate connections; neither connection reuse nor a healthy tunnel removes Edge or ChatGPT authorization requirements. Work mode can discover the registered app even when its live browser health probe returns false; investigate consent and CDP health separately from app registration.
