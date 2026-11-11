---
name: qua-test-case
description: Draft a test case in the project's conventions and create it in test management after the user approves. Use when the user wants to write or add a test case, or when /qua-test-case is run.
---

# /qua-test-case

Turn what the user describes into a test case that follows the project's conventions. The text after the command is the feature or scenario to cover. If it is empty, ask what to cover.

## Rules

- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- Never write to test management before an explicit yes to the full draft shown in chat.
- Never edit `.qua/project.yaml` and never handle secrets.
- Save conventions only with `qua_convention_write(name, text)`, never by creating or editing `.qua/conventions/` files. If the user asks to create or change the conventions here, draft the whole file in the `/qua-init` shape (header line `<!-- qua:conventions source=<provider|example> generated=YYYY-MM-DD -->` and every heading), show it, and save it with `name` `test-case` only after an explicit yes.

## Steps

1. Find the `test-case` entry of `conventions` in the `qua_project_get()` result. When `exists` is true, its `text` is the conventions; if the text is not in the result, read the file at its `path` (`.qua/conventions/test-case.md`). If `exists` is false, say so, suggest `/qua-init` (or offer to draft the conventions here, see Rules), and stop. You may still print a plain-text draft if the user asks for one.
2. Read `integrations.test_management` from `qua_project_get()`. If its status is not `connected` or it has no `project` key, say so and suggest `/qua-init`. You may output the draft as text only.
3. Gather the facts: the behavior under test, preconditions, the user's expected results. Ask one short question for anything essential that is missing. Do not invent behavior.
4. Draft the case exactly as the conventions describe: title shape, template sections, preconditions, steps with expected results, type, priority and references. Target the saved `project` and `suite`.
5. Print the full draft with every field value.
6. Ask: "Create this in test management?" Wait for the answer.
   - Yes: create the case through the test management tools you have (the saved `provider`), then print the case id and URL.
   - Changes requested: redraft and ask again.
   - No: stop. Create nothing.
