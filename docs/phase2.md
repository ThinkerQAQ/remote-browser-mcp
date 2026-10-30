# Phase 2 — Safe proxy and remote tunnel

[简体中文](phase2.zh-CN.md) · [README](../README.md)

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

Verify `tunnel-client runtimes status remote-browser`, then select this tunnel in ChatGPT connector settings.

## Default safety policy

- No raw Chrome CDP listener is exposed publicly; only an authenticated OpenAI tunnel is intended.
- `new_page` always uses `background=true`, `select_page` forces `bringToFront=false`.
- Original user tabs cannot be selected, navigated or closed in default configuration; raw network requests, file upload and arbitrary JavaScript are not offered.
- A dedicated background tab shares the Edge profile's site login state. A trusted MCP client can still encounter sensitive page content; grant access carefully.
- Transport reconnect is attempted for failed read-only `list_pages` requests, not for potentially side-effecting actions.
- Only `about:blank` focus behavior has been verified. Other site behavior may differ.
