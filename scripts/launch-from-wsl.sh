#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -n "${REMOTE_BROWSER_WINDOWS_NODE:-}" ]; then
  node_exe="$REMOTE_BROWSER_WINDOWS_NODE"
else
  node_exe=""
  for candidate in "/mnt/c/Program Files/nodejs/node.exe" /mnt/c/Users/*/.version-fox/cache/nodejs/current/node.exe; do
    if [ -f "$candidate" ]; then
      node_exe="$candidate"
      break
    fi
  done
fi
if [ ! -f "$node_exe" ]; then
  echo "Windows Node.js not found; set REMOTE_BROWSER_WINDOWS_NODE" >&2
  exit 2
fi
# Keep startup diagnostics in a private local state directory, not the repo.
umask 077
log_dir="$HOME/.local/state/remote-browser-mcp"
mkdir -p "$log_dir"
printf '%s\n' 'starting_windows_node' > "$log_dir/launch.status"
if "$node_exe" scripts/proxy.mjs 2>> "$log_dir/launch.err.log"; then
  code=0
else
  code=$?
fi
printf 'exit=%s\n' "$code" > "$log_dir/launch.status"
exit "$code"
