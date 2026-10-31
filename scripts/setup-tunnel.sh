#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "Usage: setup-tunnel.sh tunnel_<id>" >&2
  exit 2
fi
case "$1" in tunnel_*) ;; *) echo "Expected an OpenAI tunnel ID" >&2; exit 2;; esac
# Prevent two local clients competing for the same tunnel after systemd migration.
if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active --quiet remote-browser-tunnel.service 2>/dev/null; then
  echo "Remote Browser systemd supervisor is already active. Do not start a second managed runtime; use scripts/setup-wsl-service.sh status." >&2
  exit 2
fi
if [ -z "${CONTROL_PLANE_API_KEY:-}" ]; then
  echo "Local CONTROL_PLANE_API_KEY is required" >&2
  exit 2
fi
CLIENT="$HOME/.local/bin/tunnel-client"
test -x "$CLIENT" || { echo "tunnel-client not found" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$CLIENT" runtimes connect \
  --alias remote-browser \
  --profile remote-browser \
  --tunnel-id "$1" \
  --mcp-command "/bin/sh $ROOT/scripts/launch-from-wsl.sh" \
  --runtime-api-key env:CONTROL_PLANE_API_KEY
node "$ROOT/scripts/runtime-status.mjs"
printf "Optional legacy WSL auto-recovery: sh %s/scripts/setup-wsl-service.sh install\n" "$ROOT"
