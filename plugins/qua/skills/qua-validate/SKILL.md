---
name: qua-validate
description: Reproduce a ticket in the live app with Qua and report a verdict with evidence in chat. Use when the user asks to validate, verify, retest or reproduce a ticket, or when /qua-validate is run.
---

# /qua-validate

Validate one ticket live. The text after the command is the ticket key or URL, for example `ADSAI-123`. If it is empty, ask for it.

## Rules

- If you cannot read the ticket (401, 403, 404, no tracker tool), stop with verdict `blocked` and the read error as the reason. Never guess steps from the key. Report only the key and the read error: no session, screenshot or logs.
- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- The issue tracker is read-only. Never comment, transition or edit the ticket without a separate, explicit yes after the verdict.
- Never edit `.qua/project.yaml` and never handle secrets.
- Source code (`project.sources` of `qua_project_get`) may help find the route and the expected behaviour. The verdict rests on live evidence only; code findings go in a separate "Likely cause" line. Never put code, paths or source notes into `qua_do` or `qua_case_write`.
- `consent_required`: ask the user; see the `qua` skill.

## Steps

1. Read the ticket through the issue tracker tools you have (`integrations.issue_tracker`). If you cannot read it, stop with `blocked` (see Rules).
2. Check `qua_case_list()` for a saved case that already covers the flow and reuse its steps. Derive numbered repro steps (starting page, actions, expected and actual result) only from the ticket's summary, description and comments. If the steps are ambiguous, ask one question.
3. Choose the stage: the one the ticket names, if it matches a key in `stages`; otherwise omit `stage` to use `app_url`.
4. Reproduce it on a new session name such as `validate-<ticket>-<HHMM>`. Run each action with `qua_do(action, session, stage?)`: one browser action per call, assertions as separate steps. Pass `stage` only on the first call. Follow the `qua` skill for review results and errors; when a step is `review` with `review: shown in the window`, call `qua_review_view` if widgets render (in Cursor's Agents Window ask whether the user sees one), otherwise ask them to pick and call `qua_review_pick`. Never call `qua_review_answer` or `qua_shot_get`.
   - Once a session exists: at the check point, the step that decides the verdict, call `qua_session_screenshot` with `session` and `label` `verdict` for every verdict, including `blocked` (shoot the page where you stopped).
5. Report in chat:
   - Verdict: `reproduced` (the bug happens), `not reproduced` (the expected behavior holds), or `blocked` (you could not reach the point of the check: access, data, environment, a failed step you cannot explain).
   - Evidence: the steps you ran, each step's status, the observed result against the expected one, and the session name.
   - Screenshots: list the repo-relative path of the `verdict` capture and of every `screenshot:` path a `failed` or `review` step returned. Show them to the user.
   - For `blocked`: what stopped you.
   - Likely cause (optional, separate from the verdict): what the sources suggest, with file paths.
   - Once a session exists, for `reproduced` and `blocked`: call `qua_session_logs` with `kind` error and, if it shows anything, with `kind` network. Add only the lines relevant to the check to Evidence, no full dumps. Skip it for `not reproduced` unless errors appeared.
6. Offer, but do not do, an issue tracker comment. Write to the issue tracker only after a separate explicit yes.
