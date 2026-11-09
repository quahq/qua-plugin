#!/usr/bin/env bash
# Set the plugin to a qua release version, e.g. v1.5.0 or v1.5.0-rc.1-dev.
set -euo pipefail
v="${1:?usage: scripts/set-version.sh vX.Y.Z[-pre]}"
[[ "$v" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "bad version: $v" >&2; exit 1; }
cd "$(dirname "$0")/.."
url=https://dl.qua.0xdc.sh/install.sh
install="curl -fsSL $url | sh"
[[ "$v" == *-dev* ]] && install="$install -s -- --version $v"
manifest=plugins/qua/.claude-plugin/plugin.json
init=plugins/qua/skills/qua-init/SKILL.md
V="${v#v}" perl -0pi -e 's/"version": "[^"]*"/"version": "$ENV{V}"/' "$manifest"
VV="$v" perl -pi -e 's/^This plugin was built for qua v\S+\.$/This plugin was built for qua $ENV{VV}./' "$init"
I="$install" U="$url" perl -pi -e 's{`curl -fsSL \Q$ENV{U}\E[^`]*`}{`$ENV{I}`}g' "$init"
grep -q "built for qua $v\." "$init"
echo "plugin set to $v"
