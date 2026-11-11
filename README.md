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
| `tests/prose.test.mjs` | Prose guards ported from qua-cli: the ADR 0010 gate, init, validate, automate |
| `scripts/set-version.sh` | Sets `plugin.json` and `/qua-init` to a qua version; Release runs it |
| `scripts/check-old-host.sh` | Loads the plugin in a Claude Code without mods and fails on a broken hook load |

## Check

```sh
node --test tests/*.test.mjs
claude plugin validate --strict .
claude plugin test plugins/qua
```

The drift test fails when:
- a shipped `qua` tool in `contract/tools.json` is not documented in `skills/qua/SKILL.md`;
- a skill names a tool that is not shipped (proposed tools are allowed in the `qua` skill only), or the mod's allowlist names one the contract lacks;
- a backticked `tool(args)` signature names an unknown tool or disagrees with the contract's args; `qua-validate` and `qua-regress` must carry one;
- `/qua-init` names no single version or one other than `plugin.json`, or its install command does not match the channel.

The prose test keeps rules the generator's tests guarded: the `/qua-init` gate before step 1 and the "If Qua tools are missing" preface in every command (ADR 0010), frontmatter, init conventions and probes, validate's blocked rule, automate's shape, conventions saved only through `qua_convention_write`, the `sources` rules ([ADR 0057](https://github.com/quahq/qua-decisions/blob/main/0057-project-sources.md)) and explore followed by `qua_explore_status`. CI runs the checks above, then `claude plugin validate` and `scripts/check-old-host.sh` with Claude Code 2.1.286 (the last without mods). Claude Code versions are pinned in the workflows (`CLAUDE_CODE`, `OLD_CLAUDE_CODE`).

## Versions and channels

Users install a branch head, not a tag: `qua init` adds the marketplace without a ref. Stable binaries read `main`; dev binaries (`-dev` tags, `PluginMarketplaceRef=dev`) read `dev`.

- **`main` moves only through the Release workflow.** No PRs to `main` (one exception: the bootstrap below): a stable release copies the `dev` tree onto `main`, sets the version and pushes branch and tag together. So `main` never names a version before its binary exists.
- **`dev` is the dev channel and the source.** It moves only by merged PRs. `-dev` qua tags do not release the plugin and Release refuses them; bump `dev`'s version by hand with `scripts/set-version.sh vX.Y.Z-…-dev` in a PR when the dev binary moves.
- **One version, two places.** `plugin.json` `version` and the `/qua-init` gate line (`This plugin was built for qua vX`, compared with the binary, ADR 0010) both hold the qua version; the drift test keeps them equal. `claude plugin validate --strict` requires `version`, and Claude Code uses it to detect updates: a skill or mod fix reaches existing stable installs with the next stable release, and dev installs with the next version bump on `dev`, not on merge.
- **Contract per release.** `contract/SOURCE` must name the qua-core version the qua release ships (qua-cli `go.mod` at the tag). Release fails on a mismatch; `dev` may track the latest qua-core rc between releases (now `v0.3.0-rc.11`).

## How a tool change flows

1. **Contract:** change `contract/tools.yaml` in `quahq/qua-core`, implement in qua-core and qua-mcp, tag the modules.
2. **Plugin:** in a PR to `dev` here, copy `contract/tools.json` from that qua-core tag, update `contract/SOURCE` (`qua-core <tag> <commit>`), and edit the skills (and the mod) until `node --test tests/drift.test.mjs` passes.
3. **Release, same tag:** qua-cli's release, after its binaries are published, sends:

   ```sh
   gh api repos/quahq/qua-plugin/dispatches \
     -f event_type=qua-release \
     -F 'client_payload[version]=vX.Y.Z' -F 'client_payload[core]=<qua-core version in go.mod>'
   ```

   qua-cli sends it for stable tags only; its token needs `contents: write` on this repo. The **Release** workflow (also runnable by hand with the same two inputs) refuses `-dev` versions and stops early without `QUA_PLUGIN_TOKEN`. It checks out `main` without stored credentials, takes the `dev` tree, checks the contract, runs `scripts/set-version.sh`, reruns all checks, commits `qua vX.Y.Z` and pushes `main` and the tag atomically with the token. If the tag already exists with the same tree it does nothing; with a different tree it fails and names the commit (something else tagged the repo).

**Setup (owner):**
- `QUA_PLUGIN_TOKEN`: the org secret qua-cli already uses, with Contents and Workflows write on this repo. `GITHUB_TOKEN` cannot push the workflow files the `dev` tree brings to `main`.
- `release.yml` must exist on `main`, the default branch: GitHub runs `repository_dispatch` and `workflow_dispatch` only from there. A one-time bootstrap PR to `main` adds it; after that each stable release carries `dev`'s copy, so a `release.yml` change on `dev` takes effect after the next stable release.
- Rulesets for `main` and `v*` tags (only the release actor) are to be created; the repo has none yet.

## Mods and older hosts

`plugins/qua/hooks/hooks.json` is `{ "hooks": {}, "modules": ["./register.tsx"] }`. The empty `hooks` key is required:

- Claude Code before 2.1.287 reads `hooks.json` as command hooks only. Without `hooks` it fails the plugin's hook load and then drops its MCP server (`Plugin not available for MCP … hook-load-failed`, seen with 2.1.222). With `"hooks": {}` it loads 0 hooks, all skills and `plugin:qua:qua`, and ignores `modules` and the `.ts` files.
- Claude Code 2.1.287+ loads the module (checked with 2.1.318: `hooks module qua@inline loaded`, `/qua-ui probe` answers). CI keeps the older case honest with `scripts/check-old-host.sh` on 2.1.286.
- Cursor 3.28.7 and cursor-agent 2026.11.05 detect the hooks format from the entries in `hooks`; an empty object is "unknown", so they add no hooks and report no error. They never read `modules` or the module files (read from the loader source).
