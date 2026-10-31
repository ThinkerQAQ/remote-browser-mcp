#!/bin/sh
# Supervise the existing legacy WSL tunnel. Does not restart or inspect Edge.
set -eu

mode=${1:-install}
if [ "$#" -gt 1 ]; then
  echo 'Usage: sh scripts/setup-wsl-service.sh [install|status|remove]' >&2
  exit 2
fi
case "$mode" in install|status|remove) ;; *) echo 'Expected install, status or remove' >&2; exit 2;; esac

name=remote-browser-tunnel.service
unit_dir="$HOME/.config/systemd/user"
unit="$unit_dir/$name"
client="$HOME/.local/bin/tunnel-client"
config="$HOME/.config/tunnel-client/remote-browser.yaml"
credentials="$HOME/.config/tunnel-client/runtime.env"

if ! command -v systemctl >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
  echo 'A working systemd user session is required. No service or browser was changed.' >&2
  exit 2
fi

if [ "$mode" = status ]; then
  systemctl --user is-active "$name"
  exit 0
fi

if [ "$mode" = remove ]; then
  systemctl --user disable --now "$name" >/dev/null 2>&1 || :
  rm -f "$unit"
  systemctl --user daemon-reload
  echo 'Remote Browser tunnel supervision removed. Edge was not touched.'
  exit 0
fi

if [ ! -x "$client" ] || [ ! -r "$config" ]; then
  echo 'Existing tunnel-client and private remote-browser.yaml are required; run the legacy WSL tunnel setup first.' >&2
  exit 2
fi
# systemd does not inherit the interactive shell's CONTROL_PLANE_API_KEY.
# Never copy credential values into the unit, stdout, logs or the repository.
if [ ! -r "$credentials" ]; then
  echo 'A private ~/.config/tunnel-client/runtime.env is required for unattended startup.' >&2
  exit 2
fi

umask 077
mkdir -p "$unit_dir"
temporary=$(mktemp "$unit.tmp.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM
cat > "$temporary" <<'UNIT'
[Unit]
Description=Remote Browser MCP tunnel (existing Edge session)
After=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=3

[Service]
Type=simple
EnvironmentFile=%h/.config/tunnel-client/runtime.env
WorkingDirectory=%h
ExecStart=%h/.local/bin/tunnel-client run --config %h/.config/tunnel-client/remote-browser.yaml
Restart=always
RestartSec=15
UMask=0077

[Install]
WantedBy=default.target
UNIT
chmod 600 "$temporary"
if ! cmp -s "$temporary" "$unit"; then
  mv -f "$temporary" "$unit"
  systemctl --user daemon-reload
fi

# Re-running setup keeps an active browser/MCP connection intact.
if systemctl --user is-active --quiet "$name"; then
  systemctl --user enable "$name" >/dev/null
  echo 'Remote Browser tunnel supervisor already active; existing connection preserved.'
  exit 0
fi

# Do not run the old managed alias and the systemd service for the same tunnel.
# Parse locally; never print the runtime's private status JSON.
if "$client" runtimes status remote-browser --json 2>/dev/null | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
try { process.exit(JSON.parse(s).process_running===true?0:1); } catch { process.exit(1); }
});'; then
  "$client" runtimes stop remote-browser >/dev/null
fi
systemctl --user enable --now "$name" >/dev/null
if ! systemctl --user is-active --quiet "$name"; then
  echo 'Service installation completed but runtime is not active; inspect the private service journal.' >&2
  exit 2
fi
echo 'Remote Browser tunnel supervisor is active and enabled. Edge was not touched.'
