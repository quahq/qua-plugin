---
name: qua
description: Run UI checks on the app under test through Qua MCP — perform one prose browser step, run a saved case or suite, or save steps as a case. Use when the user says "check in the browser", "click/fill/verify on the site", "run suite X", or "save this as a case". Not for unit tests or for writing Playwright code.
---

# qua

qua executes browser steps written in plain prose. You write the steps and
call Qua MCP tools; qua finds the element and acts. You never touch the page.

## Project context

Configured browsers, stages and integrations come from the Qua MCP server
instructions (a startup snapshot). Call `qua_project_get` for live state.
Change project data only with `qua_project_set`; never edit `.qua/project.yaml`.
`project.sources` lists the app's code folders and repos (`abs_path`, `exists`,
note). You may read them; never put code, paths or notes into `qua_do`,
`qua_case_write` or explore text.

- Omit `browser` to use the default browser.
- Pass `browser` only when the user explicitly asks for one, and only if the
  instructions list it as configured. Otherwise say it is not configured for
  this agent and suggest `qua init`. Do not improvise with another tool.
- Omit `agent`; the server uses the agent it runs under. Your agent is the
  `agent:` line of `qua_project_get`.
- The startup instructions are a snapshot; if they say Qua was not set up,
  call `qua_project_get()` first. If the `agent:` value is missing from
  `agents`, point the user at `qua init --agents <agent>`; else if
  `configured` is false, at `/qua-init`.

## Tools

- `qua_do(action, session, browser?, stage?, target?)` — perform one prose step.
- `qua_run(suite, session, case?, browser?, stage?)` — run a saved case, or every case in a suite.
- `qua_explore(session, start?, stage?, max_steps?, max_depth?, max_minutes?, origins?, allow_submit?, browser?)` — start walking links, buttons and tabs within limits to grow the UI map; returns at once, the walk runs in the background. Never `allow_submit` without the user's explicit yes, passed as `consent`; task wording is not consent. Never finish a `needs_human` form with `qua_do`.
- `qua_explore_status(session, wait_s?)` — progress of the session's running or last explore: steps, map growth, last lines. Poll with `wait_s` 45 (waits for the end or new progress) until `running` is false, then `report` is the explore report.
- `qua_explore_stop(session)` — stop the session's running explore; only when the user asks.
- `qua_review_pick(session, timeout_s?)` — after a `review` step whose result says `review: shown in the window`, wait for the user's pick in the overlay; returns a `map_id` to pass as `target`.
- `qua_review_view(session)` — widget for a shown review: the user picks a candidate in it. Call it only when the host renders widgets.
- `qua_runs_view(id?, suite?)`, `qua_map_view(page?, fp?, tab?)`, `qua_cases_view(suite?, name?)` — widgets showing runs, the UI map and saved cases. Call them to show results when widgets render; the text tools stay the source of truth.
- `qua_record(action, session?, case?)` — `start`, `stop` or `status` of a recording of the user's manual actions in a session window; with `case` the steps are appended to that case on stop. `learn_start`, `observe` and `learn_stop` learn the map passively while the user browses, without case steps; only pages on the app URL or a stage are mapped.
- `qua_case_write(suite, name, steps)` — save `.qua/{suite}/{name}.md`.
- `qua_case_list(suite?)`, `qua_case_get(suite, name)` — read saved cases as JSON.
- `qua_case_resolved(suite, case)` — a case's resolved-step lock (`.qua/resolved/`) as JSON: per line `resolved`, `stale` and the locked action and target.
- `qua_generate(suite?, case?, out?, check?)` — render saved cases to Playwright specs under `out`; with `check` it writes nothing and fails on drift. Only when the user asks.
- `qua_run_list(suite?, status?, limit?, cursor?)`, `qua_run_get(id)` — past case runs as JSON, newest first; `qua_run_get` has each step's status, Jev judgments and screenshots.
- `qua_map_get(page?, session?)`, `qua_map_state(fp)` — the UI map as JSON: without `page` a page summary, with it the page's states and edges. On a stale map it fails with an error to delete `.qua/map` and learn again: tell the user, do not delete it yourself.
- `qua_session_list()` — list existing sessions.
- `qua_session_logs(session, tail?, kind?)` — console, page errors, failed requests and Qua errors of a session window (`kind`: console, error, network, all).
- `qua_session_screenshot(session, full_page?, label?)` — capture the session window now; returns the saved path (`.qua/screenshots/<session>/`) and the image. Cursor tabs need the Agents Window visible (not minimized).
- `qua_session_close(session)` — only when the user asks to clean up.
- `qua_project_get()` — read project data and whether it is configured; `conventions` lists the bug-report and test-case conventions (`path`, `exists`, `text`).
- `qua_project_set(app_url?, stages?, qua_env?, sources?, integrations?, other?)` — merge a patch into project data; `sources` (code folders and repos) replaces the whole list.
- `qua_convention_write(name, text)` — save the `bug-report` or `test-case` conventions (`.qua/conventions/<name>.md`) after the user approves the shown draft.
- `qua_project_configure(mcps?)` — project, browser and your MCP servers as text and a setup form; used by /qua-init.
- `qua_mcp_list()` — MCP servers from project and user Qua config (ATE chats): source, status, secret refs only.
- `qua_mcp_set(name, target, command?, args?, env?, url?, headers?, transport?, enabled?, remove?)` — add, edit or remove one server in the project or user config; secrets only as `${env:NAME}` or `${keychain:NAME}`; only when the user asks. Approval is the human's (ATE Approve or `qua mcp approve` in their terminal), never yours.
- `qua_ui_probe(echo?)` — diagnostic MCP Apps widget; only when the user asks to test widgets.
- `qua_browser_detect()` — which Playwright browser a call would attach to, and setup steps when none.
- `qua_browser_install()` — install the Playwright runtime; only after the user says yes.
- `qua_browser_start(engine?, profile?)` — start a detached browser you and the user share, or reuse the running one; only after the user says yes.
- `qua_browser_set(agent, browsers)` — set an agent's configured browsers, default first; used by /qua-init, otherwise only when the user asks.
- `qua_browser_stop(engine?)` — stop the browsers Qua started; only when the user asks.
- `qua_init`, `qua_login` — only when the user explicitly asks; both change setup.

## Playwright browser

Qua attaches to a running browser. It starts one only through `qua_browser_start`, never during a step.
A running Qua browser or a Chromium with remote debugging on is found automatically,
so omit `endpoint`; pass it only when the user gives one (a CDP address, or the
`qua+tcp://` address a Qua host printed). Engines: `chromium` (default), `firefox`,
`webkit`. A session stays on the browser it first used.
Each qua session is one window of the shared browser, with the profile's logins.
If you drive the same Chromium with your own Playwright MCP, attach it
to that endpoint (`--cdp-endpoint <endpoint>`); it sees each qua window as a page.
Never close windows you did not open.

No browser found → ask the user; on yes call `qua_browser_start` (`engine` for
firefox or webkit; the first start downloads it). It uses your agent's persistent
profile (logins survive); pass `profile: false` for a clean throwaway one.
Qua never stops a browser by itself; call `qua_browser_stop` only when the user asks.

If a tool says the Playwright runtime is missing, ask the user; on yes call
`qua_browser_install`. Never install or start a browser without the user.

## Sessions

- A session is one browser window. The first `qua_do` or `qua_run` with a new name opens it; there is no open call.
- `qua_do`: pick one name per task (for example `signup-flow`) and reuse it for
  every step; later calls continue on the same page.
- `qua_run`: always a fresh name, for example `smoke-login-20261102-1405`. Names
  already listed by `qua_session_list` are rejected.
- If the result ends with "previous window was gone", the page state was lost:
  redo the steps that led to the page. Do not close and reopen the session.
- Sessions unused for a day are closed by Qua; sessions whose window or browser is gone are dropped.
- Debug a failing page with `qua_session_logs`: console errors, thrown errors, failed requests.

## Writing steps

- One browser action per step. Split "fill email and click Next" into two.
- Name what is visible: "Click the Sign in button", not a selector.
- Assertions are steps too: "Verify the heading says Welcome".

## Saving cases

Call `qua_case_write` when the user asks to save, or after they confirm a sequence
you executed with `qua_do`. One step per array item. The same suite and name
overwrite the file.

## Reading results

Each step returns `status`, `reason` and `prose`.

- `passed` — done; continue.
- `review` — qua was not sure and did **not** perform the step. The result
  lists `candidates` (best first: `map_id`, role, name, region, score) and
  likely `actions`. Then:
  1. If exactly one candidate clearly matches what the user meant, call `qua_do`
     again with the same `action`, same `session` and `target: "<map_id>"`.
  2. Otherwise rephrase the step to name the element more precisely and
     retry once, or show the candidates to the user and ask which one.
  Never pick a candidate just because it has the highest score.
  On reason `consent_required`, ask the user; never invent consent.
  3. If the result says `review: shown in the window`, call `qua_review_view`
     when the host renders widgets. In Cursor's Agents Window widgets do not
     render: ask the user whether they see one, else use the text flow. Never call
     `qua_review_answer` or `qua_shot_get`; they are widget-only. If the user is
     watching the window, ask them to pick there and call `qua_review_pick` with the
     session (default wait 60 s); on `picked: <map_id>` re-issue `qua_do` with
     that `target`. On a cancel or a timeout, fall back to step 1 or 2.
- In a `qua_run`, a `review` step stops that case; later cases still run. Report
  the stopped case with its candidates.
- `failed` — report the step and reason to the user. Do not change the app or
  silently edit the case.

A `failed` or `review` result also has a `screenshot:`
path of the session window at that moment (Cursor: Agents Window must be visible). Show it to the user when you report
the step. If it says `note: screenshot not captured`, the step status still stands.

## Errors (the tool call itself fails)

- Cursor only (`agent: cursor`): bridge unavailable, wrong host or version →
  ask the user to run `qua patch` and reload the Agents Window, then retry.
  Session lost its tab twice → ask the user to reload the Agents Window, then
  reuse the same session name.
- No Playwright browser found, or it does not answer → call
  `qua_browser_detect`, show the user its setup steps, and retry after they
  start a browser. Offer `qua_browser_start`; call it only after the user says yes.
- Not logged in or token rejected → ask the user to run `qua login`.
- Qua MCP is not connected → stop and ask the user to fix MCP
  (Claude Code: check `/mcp`; Cursor: check Settings, MCP). Do not fall back to the `qua` CLI.

## Never

- Cursor only (`agent: cursor`): never call these Cursor browser tools: `browser_navigate`, `browser_tabs`, `browser_click`, `browser_type`, `browser_fill`, `browser_snapshot`, `browser_take_screenshot`.
- Never inspect the DOM, pass selectors or page snapshots to qua.
- Never edit `.qua/browser_sessions.json` or other files under `.qua/` except
  through `qua_case_write`, `qua_convention_write` and the files a `/qua` command
  tells you to write (`.qua/<suite>/suite.yaml`).
- Never ask for or store secrets; `qua login` is run by the user.
- Never run the `qua` CLI during a normal turn; it is for humans.

## Stages

Pass `stage: "<key>"` only when the user names a stage; keys are in the
instructions. It applies when the session is new; in Cursor the tab opens there; Playwright navigates the session's own window there only when `stage` is passed.
To switch stages, start a new session name.
