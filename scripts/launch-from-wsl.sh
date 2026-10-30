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
exec "$node_exe" scripts/proxy.mjs
