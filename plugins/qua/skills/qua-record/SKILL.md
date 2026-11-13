---
name: qua-record
description: Record what the user does by hand in a Qua session window, grow the UI map from it and optionally save the actions as a test case. Use when the user wants to show a flow, record a case by clicking, or explore by hand, or when /qua-record is run.
---

# /qua-record

Record the user's manual actions in a session window. The text after the command is an optional case, written `suite/name`, for example `smoke/login`.

## Rules

- `consent_required`: ask the user; see the `qua` skill.
- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- Never act in the window yourself while the user is recording; the user drives.
- Passwords are redacted as `<secret>` in steps. Never ask the user to type secrets into chat.
- Save a case only with `case` on `start`, or through `qua_case_write` after the user confirms the steps.

## Steps

1. Use an existing session, or open one with a harmless `qua_do` such as opening the start page (name like `record-<HHMM>`). Recording works on windows that run page scripts: Playwright windows and Cursor tabs with bridge script support.
2. Call `qua_record(action, session, case?)` with `action` `start` and, when the user wants a case, `case` set to `suite/name`. Tell the user to use the window now and say when they are done.
3. Over Playwright CDP, events on pages opened between Qua calls are collected on the next call; for gap-free capture suggest `qua record watch --session <name>` in a terminal.
4. When the user is done, call `qua_record(action, session)` with `action` `stop`. Show the recorded steps in chat and the case path if one was written.
5. If a case was written, show it with `qua_case_get(suite, name)`. Offer, but do not do, a replay: `qua_run` the saved case on a new session to check it passes.
