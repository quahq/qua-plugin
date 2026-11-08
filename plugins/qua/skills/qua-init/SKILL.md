---
name: qua-init
description: Set up Qua for this project (app URL, stages, integrations by category, and bug-report and test-case conventions). Use when the user asks to initialize or reconfigure Qua, or when /qua-init is run.
---

# /qua-init

Set up the project data Qua needs. Follow the steps in order and do not skip ahead.

This plugin was built for qua v1.4.0.

## Rules

- After step 0 passes, call `qua_project_get()` and show the current values. On a re-run, change only what the user confirms.
- Save project data only with `qua_project_set(app_url?, stages?, qua_env?, integrations?, other?)`. Never edit `.qua/project.yaml` by hand.
- Never ask for, print or store secrets (tokens, passwords, API keys).
- Never run `qua login`. If Qua reports an auth error, tell the user to run `qua login` in a terminal and stop.
- Write a file only after the user confirms its shown content.

## 0. Gate: the qua binary

Do this before anything else. Until it passes, do nothing else: no questions about the project, no saves, no files. Your agent is `claude` or `cursor`: the `agent:` line of `qua_project_get`; while Qua tools are missing, you know it from the app you run in (Claude Code or Cursor).

**No Qua tools available** (no `qua_project_get` or `qua_do` among your tools):
1. Run `command -v qua` in your shell.
2. Not found: the binary is not installed. Show these steps and offer to run them; run them only after an explicit yes.
   - `curl -fsSL https://dl.qua.0xdc.sh/install.sh | sh`
   - The script installs to `~/.local/bin` (or `/usr/local/bin`) and prints a `PATH` hint. On macOS a GUI-launched agent often does not inherit the shell `PATH`: add the install directory to `PATH` for login apps, symlink `qua` into a directory GUI apps search (for example `/opt/homebrew/bin`), or start the agent from a terminal where `command -v qua` succeeds.
   Afterwards ask the user to reload the agent and run /qua-init again, then stop.
3. Found: the binary is installed but this project or agent is not set up. Offer `qua init --agents <agent>` and run it only after a yes. If your agent is `cursor`, also offer `qua patch`, then the user must reload the Agents Window. Running `qua patch` may be blocked by macOS for you: if it fails, ask the user to run it in their own terminal. Afterwards ask the user to reload the agent and run /qua-init again, then stop.
4. Plugin install without `qua init` (`qua init` writes the same into `.claude/settings.json` for Claude Code):
   - Claude Code: the user runs these.
     ```
     /plugin marketplace add realdnchka/qua-claude-plugin
     /plugin install qua@qua
     ```
     `/plugin install` opens the plugin panel, where the user confirms the install.
   - Cursor imports Claude plugins: in Settings, Plugins, add the marketplace `realdnchka/qua-claude-plugin` and install `qua`, then fully restart Cursor (Cmd+Q).

**Qua tools available:** call `qua_project_get()` and read `qua_version`. Compare only release versions (`vX.Y.Z`, optionally `-dev.N`): skip the check if either side is `dev`, a Go pseudo-version (`v0.0.0-…`) or ends in `+dirty`. If they differ, tell the user which side is older and how to upgrade it, then ask whether to continue anyway:
- plugin older: Claude Code: run `/plugin marketplace update qua`, then reload; Cursor: remove the `qua` plugin, add it again from Settings, Plugins, then restart Cursor (it may keep the copy pinned at first install);
- binary older: run `curl -fsSL https://dl.qua.0xdc.sh/install.sh | sh` and reload the agent.

Stop unless the versions match or the user says to continue.

**Binary not initialized:** in the same `qua_project_get()` output, read `initialized` and `agents`. If `initialized` is false, or the `agent:` value is not in `agents`, `qua init` was never run here, even though the Qua tools respond. Tell the user, then:
1. Give this command in a code block, with `<agent>` replaced by the `agent:` value:
   ```sh
   qua init --agents <agent>
   ```
2. Offer to run it in the project root; run it only after an explicit yes.
3. If the agent is `cursor`, say that Cursor may additionally need `qua patch`, a reload of the Agents Window and a Cursor restart (the hook in `~/.cursor/hooks.json`).
4. Stop. Do not start step 1 until the user runs /qua-init again.

## Form: hosts that render MCP Apps

Right after step 0 passes, list every MCP server you have, Qua included, each with a category guess: `qua`, `source_control`, `issue_tracker`, `test_management`, `knowledge_base` or `other`, a lowercase `provider` when you know it (for example `jira`, `github`), and `status` `unprobed` unless you already probed it. Call `qua_project_configure` with `mcps` set to that list. Do not call any tool of those servers yet.

- The result starts with `widget: offered`: the host may still not render it (Cursor's Agents Window does not). Ask in one line: "If you see the setup form, fill it in; if not, say so and we continue here." Do not ask the step 1 questions yet. When the user answers:
  - It lists `qua_project_set` or `qua_browser_set` arguments because the form could not save: call each with exactly those arguments.
  - Then continue with step 2 (browser), step 3 only for the categories the message names as still to probe (skip `other`, the form saved it), and steps 4 to 7.
  - If the user says there is no form, follow the text steps from step 1.
- The result starts with `widget: not shown`: the text holds the same data; follow the steps below from step 1.

## 1. Project data

Ask for:
- the app URL (`app_url`, used when a session has no stage);
- stages as key to URL pairs, for example `dev`, `qa` (keys: lowercase letters, digits, `-`, `_`);
- the Qua env: `dev` or `prod`.

Save them in one `qua_project_set` call: `app_url`, `stages` (the whole map), `qua_env`.

## 2. Browser

Your agent's browsers are in `.qua/config.yaml`, default first: `ide` (the Qua app browser; it needs the Qua app open on this project), `playwright`, `cursor` (Cursor bridge). To change them, ask the user which ones and the default, and on yes call `qua_browser_set(agent, browsers)` (the form does this on Save).

If your agent's default is `ide`, tell the user sessions open in the Qua app; skip the rest of this step unless it also has `playwright`.

Call `qua_browser_detect()`. If your agent has no Playwright browser (the call says so), skip this step.

Check `runtime:` first. If the Playwright runtime is missing, explain that Qua needs it to drive the browser, ask the user, and on yes call `qua_browser_install()`. If Node is missing, tell the user to install Node.js 18+ and stop this step. Then continue with the endpoint:

- `endpoint:` is set: tell the user which browser Qua will attach to (`source:`); each qua session opens its own window there.
- `endpoint: none`: show the setup steps from the result. Offer to start a shared browser: ask which engine (`chromium` by default, or `firefox`, `webkit`; the first start downloads it), and on yes call `qua_browser_start(engine?, profile?)` (persistent profile for your agent; `profile: false` for a clean throwaway one). Tell the user the endpoint. Qua never starts a browser otherwise and never stops one; the user or you (`qua_browser_stop`, on request) do. Windows Qua did not open are never closed.
- A `warning:` line about an `endpoint` in config.yaml: tell the user it is ignored; Qua finds the browser itself.

Continue to the next step either way.

## 3. Probe integrations

Integrations are probed by category. Qua is required and needs no confirmation; the rest are optional. For the optional categories, show your provider guesses in one list and ask once to confirm or change them. A provider picked in the form or already saved counts as confirmed: say so, then probe. Run one cheap read-only probe per category, say what you probed (repo, user, space), and record the result. Tool names differ per server, so pick the tool that does the job.

| Category (name) | Providers, for example | Probe |
|---|---|---|
| Qua (`qua`, required) | Qua MCP | `qua_project_get()` succeeds. If you also have a Qua tool that returns the signed-in user, call it. |
| Source control (`source_control`) | GitHub, GitLab, Bitbucket | check access to the repository behind `origin` |
| Issue tracker (`issue_tracker`) | Jira, Linear, YouTrack, GitHub Issues | get the current user |
| Test management (`test_management`) | TestRail, Zephyr, Xray, Qase | list projects |
| Knowledge base (`knowledge_base`) | Confluence, Notion | search one space |

One provider per category. If several fit, ask the user which one to use. Never call an optional provider's tool before it is confirmed.

Save each result with `qua_project_set` as `integrations: {<category>: {provider: "<provider>", status: "<status>"}}`. `provider` is free text: lowercase, for example `jira`, `linear`, `testrail`.

Status values:
- `connected`: the probe succeeded.
- `failed`: you have the tools but the probe errored (keep the error text for the user, not for the file).
- `missing`: you have no tool for that category (omit `provider`).

If the Qua probe fails, stop and tell the user to run `qua login`.

Every other MCP server you have (for example Figma or Slack) that fits no category: save its lowercase name in `other` through `qua_project_set` (send the whole list). Do not call any of its tools.

## 4. Category keys

For each category that is `connected`, ask for its keys and check you can read them through the provider's tools. Save them under `integrations.<category>.keys`, keeping the existing `provider` and `status`:

- `source_control`: `repo` (for example `owner/name`);
- `issue_tracker`: `project` (the project or team key, for example `ADSAI`);
- `test_management`: `project` and `suite` (ids or names as the provider shows them);
- `knowledge_base`: `space`.

No other keys are accepted. Skip silently any category that is not `connected`; if none is, skip this step.

## 5. Bug-report conventions

Target file: `.qua/conventions/bug-report.md`. The conventions come from the issue tracker, whatever the provider.

- If `issue_tracker` is `connected`: read the last 20 bugs of the saved project. If the provider is Jira, search with JQL `project = KEY AND issuetype = Bug ORDER BY created DESC`, 20 results. Otherwise use the last 20 bugs via the tracker's search. From them derive the summary shape, the description template, the fields in use, labels, components and the priority ladder.
- Otherwise ask the user for one example bug report and derive the same from it.

Draft the file in exactly this shape. Keep every heading, in this order. Use the tracker's provider name for `source` (for example `source=jira`), `source=example` for an example, and today's date.

```markdown
<!-- qua:conventions source=<provider|example> generated=YYYY-MM-DD -->
# Bug report conventions

## Summary
<summary shape, one or two real examples>

## Template
<description template with its section headings>

## Fields
<fields and their usual values>

## Labels
<labels in use>

## Components
<components in use>

## Priority
<priority ladder and when each applies>
```

Show the full draft in chat and ask whether to save it. Write the file only after an explicit yes. If the user asks for edits, redraft and ask again. If the user declines, write nothing and offer to redraft.

## 6. Test-case conventions

Target file: `.qua/conventions/test-case.md`.

- If `test_management` is `connected`: read existing cases (about 20) from the saved project and suite and derive the title shape, sections, preconditions, steps and expected results, type, priority and references.
- Otherwise ask the user for one example test case.

Use this shape, same rules as step 5 (`source=<provider>` of the test management tool, or `source=example`):

```markdown
<!-- qua:conventions source=<provider|example> generated=YYYY-MM-DD -->
# Test case conventions

## Title
<title shape, one or two real examples>

## Template
<case layout: preconditions, steps, expected results>

## Fields
<type, priority, references and their usual values>
```

Show the draft, then write only after an explicit yes.

## 7. Suite stage tags

List the suite directories in `.qua/` (directories holding case `*.md` files; skip `conventions` and `runs`). If there are any, offer to tag suites with the stages they apply to. For each suite the user agrees to, write `.qua/<suite>/suite.yaml`:

```yaml
stages: [qa, dev]
```

Use only stage keys saved in step 1. Suites without `suite.yaml` stay untagged. Show each file before writing and write it only after a yes.

## Finish

Call `qua_project_get()` and give a short summary: URL and stages, integration providers and statuses, conventions files written, suites tagged. Tell the user that `.qua/project.yaml`, `.qua/conventions/` and `suite.yaml` files should be committed.
