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
| `plugins/qua/.claude-plugin/plugin.json` | Manifest; `version` is the qua release it ships with |
| `plugins/qua/.mcp.json` | Starts `qua mcp` from `PATH` |
| `plugins/qua/skills/` | `qua` and the `/qua-*` command skills |
| `plugins/qua/hooks/`, `plugins/qua/tests/` | The `qua-ui` mod and its tests ([plugin README](plugins/qua/README.md)) |
| `contract/tools.json` | Tool contract vendored from `quahq/qua-core`; `contract/SOURCE` names its tag and commit |
| `tests/drift.test.mjs` | Skills and mod vs the contract |
| `scripts/set-version.sh` | Sets the plugin to a qua version |

## Check

```sh
node --test tests/drift.test.mjs
claude plugin validate --strict .
claude plugin test plugins/qua
```

The drift test fails when a shipped `qua` tool in `contract/tools.json` is not documented in `skills/qua/SKILL.md`, when any skill or the mod names a tool the contract lacks, when a `tool(args)` signature disagrees with the contract's args, or when `plugin.json` and `/qua-init` name different versions. CI runs all three plus a validate with Claude Code 2.1.286.

## How a tool change flows

1. **Contract:** change `contract/tools.yaml` in `quahq/qua-core`, implement in qua-core and qua-mcp, tag the modules.
2. **Plugin:** in a PR to `dev` here, copy the new `contract/tools.json` from that qua-core tag, update `contract/SOURCE`, and edit the skills (and the mod) until `node --test tests/drift.test.mjs` passes.
3. **Release, same tag:** when qua is released as `vX.Y.Z`, run `scripts/set-version.sh vX.Y.Z` in a PR to `dev` (`-dev` tags) or `main`, merge it, then run the **Release** workflow with `version: vX.Y.Z`. It refuses a version that differs from `plugin.json`, reruns the checks and pushes the tag. Plugin and binary tags match exactly.

## Mods and older hosts

`plugins/qua/hooks/hooks.json` is `{ "hooks": {}, "modules": ["./register.tsx"] }`. The empty `hooks` key is required:

- Claude Code before 2.1.287 reads `hooks.json` as command hooks only. Without `hooks` it fails the plugin's hook load and then drops its MCP server (`Plugin not available for MCP … hook-load-failed`, seen with 2.1.222). With `"hooks": {}` it loads 0 hooks, all skills and `plugin:qua:qua`, and ignores `modules` and the `.ts` files.
- Claude Code 2.1.287+ loads the module (checked with 2.1.318: `hooks module qua@inline loaded`, `/qua-ui probe` answers).
- Cursor 3.28.7 and cursor-agent 2026.11.05 detect the hooks format from the entries in `hooks`; an empty object is "unknown", so they add no hooks and report no error. They never read `modules` or the module files (read from the loader source).
