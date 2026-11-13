---
name: qua-bug-report
description: Draft a bug report in the project's conventions and create it in the issue tracker after the user approves. Use when the user wants to file, log or write up a bug, or when /qua-bug-report is run.
---

# /qua-bug-report

Turn what the user describes into a bug report that follows the project's conventions. The text after the command is the bug description. If it is empty, ask what the bug is.

## Rules

- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- Never write to the issue tracker before an explicit yes to the full draft shown in chat.
- Never edit `.qua/project.yaml` and never handle secrets.
- Save conventions only with `qua_convention_write(name, text)`, never by creating or editing `.qua/conventions/` files. If the user asks to create or change the conventions here, draft the whole file in the `/qua-init` shape (header line `<!-- qua:conventions source=<provider|example> generated=YYYY-MM-DD -->` and every heading), show it, and save it with `name` `bug-report` only after an explicit yes.
- Never put code, paths or source notes into `qua_do` or `qua_case_write`.
- `consent_required`: ask the user; see the `qua` skill.

## Steps

1. Find the `bug-report` entry of `conventions` in the `qua_project_get()` result. When `exists` is true, its `text` is the conventions; if the text is missing or cut short (the text output caps each convention at 8000 bytes), read the file at its `path` (`.qua/conventions/bug-report.md`). If `exists` is false, say so, suggest `/qua-init` (or offer to draft the conventions here, see Rules), and stop. You may still print a plain-text draft if the user asks for one.
2. Read `integrations.issue_tracker` from `qua_project_get()`. If its status is not `connected` or it has no `project` key, say so and suggest `/qua-init`. You may output the draft as text only.
3. Gather the facts from the user's message: what happened, expected result, steps, environment or stage, evidence. Ask one short question for anything essential that is missing. Do not invent steps, versions or results.
   - If the bug was seen in a Qua session (the user names one, or one was just used here), call `qua_session_logs` with `kind` error and with `kind` network, and offer the relevant lines as evidence in the draft. Ask which session if unclear.
   - Same session: offer its latest `screenshot:` path from a step result, or take one with `qua_session_screenshot` with `session` and `label` `bug`, as evidence. Attach it to the issue only if the issue tracker tools support attachments; otherwise give the path.
   - Never include tokens, cookies or auth headers from logs.
4. Draft the bug exactly as the conventions describe: summary shape, description template, fields, labels, components and priority from the ladder. Use the tracker project key from project data.
   - Source code (`project.sources`): add a suspected-area line with file paths only when the user asks for it or the conventions have such a field. Never add code otherwise.
5. Print the full draft: summary, description, and every field value.
6. Ask: "Create this in the issue tracker?" Wait for the answer.
   - Yes: create the issue through the issue tracker tools you have (the saved `provider`), then print the issue key and URL.
   - Changes requested: redraft and ask again.
   - No: stop. Create nothing.
