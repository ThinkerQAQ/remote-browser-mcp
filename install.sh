#!/bin/sh
# Standalone source bootstrap. Download this file, then run sh install.sh.
set -eu
umask 077
case $(uname -s) in
  Linux) STATE=${XDG_STATE_HOME:-"$HOME/.local/state"}/remote-browser-mcp ;;
  Darwin) STATE="$HOME/Library/Application Support/RemoteBrowserMCP" ;;
  *) echo 'Use install.ps1 on Windows.' >&2; exit 2 ;;
esac
ROOT=${REMOTE_BROWSER_INSTALL_DIR:-"$STATE/app"}
if [ ! -f "$ROOT/setup.sh" ]; then
  for required in curl tar; do command -v "$required" >/dev/null 2>&1 || { echo "Install $required first." >&2; exit 2; }; done
  if [ -d "$ROOT" ] && [ -n "$(ls -A "$ROOT")" ]; then echo 'Installation directory is not empty; choose another REMOTE_BROWSER_INSTALL_DIR.' >&2; exit 2; fi
  mkdir -p "$STATE"; chmod 700 "$STATE"
  TEMP_DIR=$(mktemp -d "$STATE/source-download.XXXXXXXX")
  trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM
  curl --fail --location --silent --show-error --max-time 120 https://github.com/ThinkerQAQ/remote-browser-mcp/archive/refs/heads/main.tar.gz -o "$TEMP_DIR/source.tar.gz"
  tar -xzf "$TEMP_DIR/source.tar.gz" -C "$TEMP_DIR"
  [ -f "$TEMP_DIR/remote-browser-mcp-main/setup.sh" ] || { echo 'Invalid project archive.' >&2; exit 2; }
  mkdir -p "$ROOT"
  cp -R "$TEMP_DIR/remote-browser-mcp-main/." "$ROOT/"
  rm -rf "$TEMP_DIR"; trap - EXIT HUP INT TERM
fi
exec sh "$ROOT/setup.sh" "$@"
