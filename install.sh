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
  ASSET="remote-browser-mcp-v0.3.0-$(case "$(uname -s)" in Linux) echo linux;; Darwin) echo macos;; esac).tar.gz"
  URL="https://github.com/ThinkerQAQ/remote-browser-mcp/releases/download/v0.3.0"
  curl --fail --location --silent --show-error --max-time 180 "$URL/$ASSET" -o "$TEMP_DIR/$ASSET"
  curl --fail --location --silent --show-error --max-time 60 "$URL/SHA256SUMS" -o "$TEMP_DIR/SHA256SUMS"
  EXPECTED=$(awk -v n="$ASSET" '$2 == n {print $1; exit}' "$TEMP_DIR/SHA256SUMS")
  case "$EXPECTED" in ????????????????????????????????????????????????????????????????) ;; *) echo 'Invalid release checksum.' >&2; exit 2;; esac
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL=$(sha256sum "$TEMP_DIR/$ASSET" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL=$(shasum -a 256 "$TEMP_DIR/$ASSET" | awk '{print $1}')
  else
    echo 'SHA-256 checker required (sha256sum or shasum).' >&2; exit 2
  fi
  [ "$ACTUAL" = "$EXPECTED" ] || { echo 'Release archive checksum mismatch.' >&2; exit 2; }
  tar -xzf "$TEMP_DIR/$ASSET" -C "$TEMP_DIR"
  [ -f "$TEMP_DIR/remote-browser-mcp-v0.3.0/setup.sh" ] || { echo 'Invalid project archive.' >&2; exit 2; }
  mkdir -p "$ROOT"
  cp -R "$TEMP_DIR/remote-browser-mcp-v0.3.0/." "$ROOT/"
  rm -rf "$TEMP_DIR"; trap - EXIT HUP INT TERM
fi
exec sh "$ROOT/setup.sh" "$@"
