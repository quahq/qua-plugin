---
name: qua-explore
description: Explore the app with Qua to map its pages, dialogs and links, then summarize what was found and offer to save flows as cases. Use when the user asks to explore, crawl or map the app or a section of it, or when /qua-explore is run.
---

# /qua-explore

Walk the app's controls and grow the UI map. The text after the command is an optional start URL or stage key, for example `qa` or `https://app.example/settings`.

## Rules

- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- "Explore", "fill forms" or any task wording is not consent to submit. Never pass `allow_submit` on your own. Ask "Submit forms on <stage>? This creates data." and pass `allow_submit` only after an explicit yes, with `consent` set to the user's words.
- After explore reports `needs_human` or skipped submits: report them and stop. Complete one only on the user's explicit yes for that control, via `qua_do` with `consent` set to their words; never on task wording, never to "finish the job". On `consent_required`, ask the user; never invent consent.
- Prefer a non-production stage. If the only target is production, say so and ask before starting.
- Never edit `.qua/project.yaml`.
- Source code (`project.sources` of `qua_project_get`) may be read for routes, to propose start pages and sections. Never put code, paths or source notes into `qua_do`, `qua_case_write` or explore arguments.

## Steps

1. Choose the target: a stage key from `stages` goes to `stage`, a URL to `start`, nothing means the session's current page or `app_url`. Without a target from the user, you may propose start pages or sections from the routes in the sources and ask which one. Keep the default limits unless the user gave others (`max_steps`, `max_depth`, `max_minutes`, `origins`).
2. Call `qua_explore(session, start?, stage?, max_steps?, max_depth?, max_minutes?, origins?, allow_submit?)` with a session name such as `explore-<HHMM>`. It starts the walk and returns at once; the walk runs in the background for minutes. Do not call `qua_do` or start another explore on the same session meanwhile.
3. Follow it with `qua_explore_status(session, wait_s?)` and `wait_s` 45: each call waits up to 45 s for the walk to end or move on. Repeat until `running` is false, with a one-line progress update (steps, states and edges found) between calls. When it ends, `report` holds the walk's report; `error` is set if it failed. Do not restart explore because a status call shows no new steps. If the user wants to stop the walk, call `qua_explore_stop(session)`, then read the status once more for the partial report.
4. Summarize the report in chat:
   - Why it stopped (frontier exhausted or a limit) and the step count.
   - Pages and states found, and the main navigation edges in plain words; `qua_map_get(page?)` and `qua_map_state(fp)` read the map for details.
   - Skipped as destructive and `needs_human` controls, with the page each is on. Ask whether any should be explored by hand; do not act on them.
   - Form submits skipped for lack of `allow_submit`, external links, and errors.
5. Offer, but do not do, the next steps: raise the limits or explore a section deeper, rerun with `allow_submit` and `consent` after a yes, or save a found flow with `qua_case_write` (one prose action per step) after the user confirms the steps.
