# qua

Prose-driven browser QA through Qua MCP. The plugin gives the agent the `qua` skill and the `/qua-*` commands, starts `qua mcp` from the `qua` binary on `PATH`, and in Claude Code 2.1.287+ adds the `qua-ui` mod. Source and release steps: the [repository README](../../README.md).

## Commands

`/qua-init`, `/qua-validate`, `/qua-regress`, `/qua-bug-report`, `/qua-test-case`, `/qua-explore`, `/qua-record`, `/qua-automate`, plus the `qua` skill for single steps and saved cases.

## qua-ui mod

Draws Qua state beside the chat at zero model tokens (quahq/qua-decisions#19). Needs Claude Code 2.1.287+ in the terminal or the Desktop Code tab 2.1.286+; older hosts and Cursor skip it.

| Surface | What it shows | Data |
|---|---|---|
| `/qua-ui` → **Qua sessions** pane | Sessions, with Shot, Logs and Close… per row; polls every 3 s while open | `qua_session_list`, `qua_session_logs`, `qua_session_screenshot` |
| **Qua run** pane | The latest run's steps (✓ ✗ ?) with reasons and sub-steps; recent `qua_do` steps; recent runs | `qua_run_list`, `qua_run_get`, Claude's own `qua_run`/`qua_do` results |
| **Qua shot** pane | The last screenshot: `Svg` in Desktop and VS Code, `Image` in kitty, Ghostty or iTerm2 | `qua_session_screenshot`, or the step's file through `sips` |
| Band above the prompt | `qua run smoke/login ✓✓✗ 2/3 4.1s [Steps]` while a `qua_run`, `qua_do` or `qua_explore` runs | `qua_run_get` every 1.5 s |
| `/qua-config` → **Qua config** pane | The `/qua-init` form; **Save** sends only changed fields | `qua_project_get`, `qua_project_set` (Save only) |

Rules the code keeps: MCP only through `$.mcp.call`, only the reads above plus `qua_project_set` from Save; every other action goes into the prompt with `$.prompt.fill` and you press Enter; no `tool.check`, no `$.prompt.submit`, no approvals.

The mod calls `plugin:qua:qua`, then `qua`; `QUA_UI_SERVER` overrides. `$.mcp.call` goes through your permission rules. Allow the reads once ("don't ask again") or add them to `permissions.allow`:

```json
"mcp__plugin_qua_qua__qua_session_list", "mcp__plugin_qua_qua__qua_session_logs",
"mcp__plugin_qua_qua__qua_session_screenshot", "mcp__plugin_qua_qua__qua_run_list",
"mcp__plugin_qua_qua__qua_run_get", "mcp__plugin_qua_qua__qua_project_get"
```

Leave `qua_project_set` on ask. `/qua-ui probe` shows which server answers.

## qua-guard (PoC, off by default)

Opt-in guard that keeps the agent's browser work on the app under test on Qua tools (quahq/qua-decisions#22). Playwright inside Qua is unaffected.

- Switch: `/qua-guard on|off|status` (per project folder, kept in the plugin store; only a person's prompt switches it), or `QUA_GUARD=1`/`0` in the environment or the `env` block of `~/.claude/settings.json`, which wins.
- Denies, in the main loop and in subagents: `mcp__Claude_Browser__*`, `mcp__claude-in-chrome__*`, any MCP server whose name contains `playwright`; Bash that runs `curl`, `wget`, `open`, `node`, `npx`, `python` and the like against the project's `app_url` or stages (from `qua_project_get`; loopback hosts when unknown); `playwright open|codegen|screenshot|…`; `WebFetch` to those hosts; other plugins' `$.mcp.call` to a browser server.
- The deny tells the model to use `qua_do`, `qua_run` or `qua_explore`. `qua_*` tools and the `qua` CLI keep working.
- Best effort: Bash is matched by text, so a variable, a script file or an encoded command gets through.

### Develop

```sh
claude --plugin-dir plugins/qua        # reloads on save
claude plugin validate --strict plugins/qua
claude plugin test plugins/qua
```
