#!/bin/sh
set -eu
umask 077
ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
case $(uname -s) in
  Linux) PLATFORM=linux; STATE=${XDG_STATE_HOME:-"$HOME/.local/state"}/remote-browser-mcp ;;
  Darwin) PLATFORM=darwin; STATE="$HOME/Library/Application Support/RemoteBrowserMCP" ;;
  *) echo 'Use setup.cmd on Windows. Linux/macOS only.' >&2; exit 2 ;;
esac
node_ok() { command -v node >/dev/null 2>&1 && node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)' >/dev/null 2>&1; }
if [ "${1:-}" = --check ] || [ "${1:-}" = --help ]; then
  if node_ok && [ -d "$ROOT/node_modules/smol-toml" ]; then exec node "$ROOT/scripts/setup-unix.mjs" "$@"; fi
  echo 'Preflight: Node.js 22+ and project dependencies are not installed. Run sh setup.sh to install them.'
  exit 2
fi
mkdir -p "$STATE"
chmod 700 "$STATE"
if ! node_ok || ! command -v npm >/dev/null 2>&1; then
  for binary in "$STATE"/tools/node/*/bin/node; do
    if [ -x "$binary" ]; then PATH="$(dirname "$binary"):$PATH"; export PATH; break; fi
  done
fi
if ! node_ok || ! command -v npm >/dev/null 2>&1; then
  for required in curl tar awk; do command -v "$required" >/dev/null 2>&1 || { echo "Install $required using your OS package manager, then rerun setup.sh." >&2; exit 2; }; done
  case $(uname -m) in x86_64|amd64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; *) echo '64-bit x86 or ARM required.' >&2; exit 2;; esac
  digest() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
  command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || { echo 'Install a SHA-256 utility first.' >&2; exit 2; }
  TEMP_DIR=$(mktemp -d "$STATE/node-download.XXXXXXXX")
  trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM
  echo 'Installing private Node.js 24 LTS from nodejs.org...'
  curl --fail --location --silent --show-error --max-time 45 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$TEMP_DIR/SHA256SUMS"
  ENTRY=$(awk -v p="$PLATFORM" -v a="$ARCH" '$2 ~ "^node-v24[.][0-9.]+-"p"-"a"[.]tar[.]gz$" && length($1)==64 {print $1" "$2; exit}' "$TEMP_DIR/SHA256SUMS")
  [ -n "$ENTRY" ] || { echo 'Supported official Node archive not found.' >&2; exit 2; }
  EXPECTED=${ENTRY%% *}; NAME=${ENTRY#* }
  VERSION=${NAME#node-}; VERSION=${VERSION%%-*}
  curl --fail --location --silent --show-error --max-time 180 "https://nodejs.org/dist/$VERSION/$NAME" -o "$TEMP_DIR/node.tar.gz"
  [ "$(digest "$TEMP_DIR/node.tar.gz")" = "$EXPECTED" ] || { echo 'Node checksum mismatch.' >&2; exit 2; }
  mkdir -p "$STATE/tools/node"
  tar -xzf "$TEMP_DIR/node.tar.gz" -C "$TEMP_DIR"
  FOLDER=${NAME%.tar.gz}
  [ -x "$TEMP_DIR/$FOLDER/bin/node" ] || { echo 'Invalid Node archive layout.' >&2; exit 2; }
  rm -rf "$STATE/tools/node/$FOLDER"
  mv "$TEMP_DIR/$FOLDER" "$STATE/tools/node/"
  PATH="$STATE/tools/node/$FOLDER/bin:$PATH"; export PATH
  rm -rf "$TEMP_DIR"; trap - EXIT HUP INT TERM
fi
cd "$ROOT"
node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)' || { echo 'Node cannot run on this OS. Check OS/glibc compatibility.' >&2; exit 2; }
if ! node --input-type=module -e 'import fs from "node:fs";import{createHash}from"node:crypto";const h=createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex");process.exit(fs.existsSync("node_modules/.setup-lock")&&fs.readFileSync("node_modules/.setup-lock","utf8").trim()===h?0:1)' 2>/dev/null; then
  echo 'Installing locked project dependencies...'
  npm ci --ignore-scripts --no-audit --no-fund
  node --input-type=module -e 'import fs from "node:fs";import{createHash}from"node:crypto";fs.writeFileSync("node_modules/.setup-lock",createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex"))'
fi
exec node "$ROOT/scripts/setup-unix.mjs" "$@"
