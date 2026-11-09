#!/usr/bin/env bash
# Load plugins/qua in a Claude Code without mods; fail if its hooks break the plugin.
# Usage: scripts/check-old-host.sh <claude command...>
set -uo pipefail
cd "$(dirname "$0")/.."
home="$(mktemp -d "${TMPDIR:-/tmp}/oldhost.XXXXXX")" || exit 1
[ -d "$home" ] || exit 1
log="$home/debug.log"
HOME="$home" ANTHROPIC_API_KEY= timeout 180 "$@" --plugin-dir plugins/qua --debug-file "$log" -p "hi" </dev/null >/dev/null 2>&1
"$@" --version
fail=0
grep -E 'hook-load-failed|Failed to load hooks' "$log" && fail=1
grep -q 'Loaded inline plugin from path: qua' "$log" || { echo "plugin qua not loaded"; fail=1; }
grep -qE 'Loaded [0-9]+ skills from plugin qua' "$log" || { echo "skills of qua not loaded"; fail=1; }
[ "$fail" = 0 ] && echo "old host loads plugins/qua: ok"
exit "$fail"
