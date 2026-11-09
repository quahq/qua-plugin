# qua-plugin

The `qua` plugin for Claude Code (Cursor loads it too): Qua skills, the `qua mcp` server registration and the `qua-ui` mod. This repo is the hand-edited source ([ADR 0054](https://github.com/quahq/qua-decisions/blob/main/0054-qua-plugin-repo-as-source.md)); nothing here is generated. The MCP server code lives in `quahq/qua-mcp`, the CLI in `quahq/qua-cli`.

## Install

`qua init` installs it. By hand, in Claude Code:

```
/plugin marketplace add quahq/qua-plugin
/plugin install qua@qua
```

The plugin needs a `qua` binary of the same version on `PATH`; `/qua-init` checks it ([ADR 0010](https://github.com/quahq/qua-decisions/blob/main/0010-plugin-binary-gate.md)).

## Layout

| Path | What |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace `qua` with the one plugin |
| `plugins/qua/.claude-plugin/plugin.json` | Manifest; `version` is the qua version (see Versions) |
| `plugins/qua/.mcp.json` | Starts `qua mcp` from `PATH` |
| `plugins/qua/skills/` | `qua` and the `/qua-*` command skills |
| `plugins/qua/hooks/`, `plugins/qua/tests/` | The `qua-ui` mod and its tests ([plugin README](plugins/qua/README.md)) |
| `contract/tools.json` | Tool contract vendored from `quahq/qua-core`; `contract/SOURCE` names its tag and commit |
| `tests/drift.test.mjs` | Skills and mod vs the contract |
| `scripts/set-version.sh` | Sets `plugin.json` and `/qua-init` to a qua version; Release runs it |
| `scripts/check-old-host.sh` | Loads the plugin in a Claude Code without mods and fails on a broken hook load |

## Check

```sh
node --test tests/drift.test.mjs
claude plugin validate --strict .
claude plugin test plugins/qua
```

The drift test fails when:
- a shipped `qua` tool in `contract/tools.json` is not documented in `skills/qua/SKILL.md`;
- a skill names a tool that is not shipped (proposed tools are allowed in the `qua` skill only), or the mod's allowlist names one the contract lacks;
- a backticked `tool(args)` signature names an unknown tool or disagrees with the contract's args; `qua-validate` and `qua-regress` must carry one;
- `/qua-init` names no single version or one other than `plugin.json`, or its install command does not match the channel.

CI runs the three checks above, then `claude plugin validate` and `scripts/check-old-host.sh` with Claude Code 2.1.286 (the last without mods). Claude Code versions are pinned in the workflows (`CLAUDE_CODE`, `OLD_CLAUDE_CODE`).

## Versions and channels

Users install a branch head, not a tag: `qua init` adds the marketplace without a ref. Stable binaries read `main`; dev binaries (`-dev` tags, `PluginMarketplaceRef=dev`) read `dev`.

- **`main` moves only through the Release workflow.** No PRs to `main`: a stable release copies the `dev` tree onto `main`, sets the version and pushes branch and tag together. So `main` never names a version before its binary exists.
- **`dev` is the dev channel and the source.** Feature PRs go to `dev`. It names the latest `-dev` qua version; each `-dev` release sets its own.
- **One version, two places.** `plugin.json` `version` and the `/qua-init` gate line (`This plugin was built for qua vX`, compared with the binary, ADR 0010) both hold the qua version; the drift test keeps them equal. `claude plugin validate --strict` requires `version`, and Claude Code uses it to detect updates: a skill or mod fix merged to `dev` reaches existing installs with the next release (a `-dev` release for the dev channel), not on merge.
- **Contract per release.** `contract/SOURCE` must name the qua-core version the qua release ships (qua-cli `go.mod` at the tag). Release fails a stable release on a mismatch and warns for `-dev`; `dev` may track the latest qua-core rc between releases (now `v0.3.0-rc.11`).

## How a tool change flows

1. **Contract:** change `contract/tools.yaml` in `quahq/qua-core`, implement in qua-core and qua-mcp, tag the modules.
2. **Plugin:** in a PR to `dev` here, copy `contract/tools.json` from that qua-core tag, update `contract/SOURCE` (`qua-core <tag> <commit>`), and edit the skills (and the mod) until `node --test tests/drift.test.mjs` passes.
3. **Release, same tag:** qua-cli's release, after its binaries are published, sends:

   ```sh
   gh api repos/quahq/qua-plugin/dispatches \
     -f event_type=qua-release \
     -F 'client_payload[version]=vX.Y.Z' -F 'client_payload[core]=<qua-core version in go.mod>'
   ```

   The token needs `contents: write` on this repo. The **Release** workflow (also runnable by hand with the same two inputs) picks `main` for stable and `dev` for `-dev` versions, checks the contract, runs `scripts/set-version.sh`, reruns all checks, commits `qua vX.Y.Z` and pushes the branch and tag atomically. If the tag already exists with the same tree it does nothing; with a different tree it fails and names the commit (something else tagged the repo).

Release pushes with the `QUA_PLUGIN_RELEASE_TOKEN` secret when set (needed once `.github/workflows` changes reach `main`, since `GITHUB_TOKEN` cannot push workflow files), else `GITHUB_TOKEN`. A tag ruleset on `v*` allowing only that actor keeps tag names trustworthy for consumers that pin by tag (the ATE).

## Mods and older hosts

`plugins/qua/hooks/hooks.json` is `{ "hooks": {}, "modules": ["./register.tsx"] }`. The empty `hooks` key is required:

- Claude Code before 2.1.287 reads `hooks.json` as command hooks only. Without `hooks` it fails the plugin's hook load and then drops its MCP server (`Plugin not available for MCP … hook-load-failed`, seen with 2.1.222). With `"hooks": {}` it loads 0 hooks, all skills and `plugin:qua:qua`, and ignores `modules` and the `.ts` files.
- Claude Code 2.1.287+ loads the module (checked with 2.1.318: `hooks module qua@inline loaded`, `/qua-ui probe` answers). CI keeps the older case honest with `scripts/check-old-host.sh` on 2.1.286.
- Cursor 3.28.7 and cursor-agent 2026.11.05 detect the hooks format from the entries in `hooks`; an empty object is "unknown", so they add no hooks and report no error. They never read `modules` or the module files (read from the loader source).
