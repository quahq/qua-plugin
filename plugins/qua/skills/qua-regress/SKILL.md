---
name: qua-regress
description: Run the project's saved Qua suites, optionally only those tagged for a stage, and summarize the results. Use when the user asks to run regression or the suites, or when /qua-regress is run.
---

# /qua-regress

Run saved suites and summarize. The text after the command is an optional stage key, for example `qa`.

## Rules

- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- Never write to any tracker. Never edit `.qua/project.yaml`.
- Never change cases to make a run pass.

## Steps

1. Call `qua_case_list()` and take the suites of its cases.
2. Choose suites:
   - With a stage argument: it must be a key in `stages`, otherwise list the configured keys and stop. Keep only suites whose `.qua/<suite>/suite.yaml` lists that stage under `stages`. Suites with no `suite.yaml` are excluded. If no suite matches, say so and run nothing.
   - Without an argument: keep every suite, tagged or not. Do not pass `stage`.
3. For each chosen suite call `qua_run(suite, session, stage?)`. `session` is a fresh name such as `regress-<suite>-<YYYYMMDD-HHMM>`. Pass `stage` only when the user gave one. Run suites one after another.
4. Summarize:
   - A table with one row per case: suite, case, status (`passed`, `failed` or `review`).
   - For each `failed` case: the step and the reason.
   - For each `failed` or `review` case: the `screenshot:` path from the stopped step's result.
   - For each `failed` case also call `qua_session_logs` with `kind` error and `tail` 20 and add the one or two most relevant lines next to the step and reason.
   - For each `review` case: the step and its `candidates` (`map_id`, role, name). Do not pick a candidate yourself.
   - The log paths under `.qua/runs/` when the results give them. For a step's Jev judgments call `qua_run_get(id)` with an id from `qua_run_list(suite)`.
   - Totals: passed, failed, review.
5. When the host renders widgets, show the runs with `qua_runs_view(suite?)`. In Cursor's Agents Window ask whether the user sees a widget; if not, keep the text summary. Never call `qua_review_answer` or `qua_shot_get`.
