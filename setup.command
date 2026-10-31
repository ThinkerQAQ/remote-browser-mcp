#!/bin/sh
# Finder double-click entry for macOS.
ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
sh "$ROOT/setup.sh" "$@"
result=$?
if [ "$result" -ne 0 ]; then printf '\nSetup paused. Press Enter to close; run setup.command again to resume.\n'; read -r unused; fi
exit "$result"
