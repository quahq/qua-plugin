---
name: qua-automate
description: Turn saved Qua cases into automated tests in the project's own framework (Playwright, Cypress, pytest, behave, WebdriverIO, ...), reusing its page objects, helpers and steps. Use when the user wants to automate, convert or export Qua cases to code or autotests, or when /qua-automate is run.
---

# /qua-automate

Write tests for Qua cases in this repo's own test framework. The text after the command is a case `suite/name`, a suite, or empty for every case. You read the repo and write the code; Qua supplies the data.

## Rules

- If Qua tools are missing, stop and point the user to /qua-init.
- Call `qua_project_get()` first. If `configured` is false, stop and tell the user to run `/qua-init`.
- Locators come only from the lock or the UI map. Never invent a selector, text or test id.
- Reuse before adding: existing page objects, their fields, helpers, fixtures and step definitions. Add new ones only when none fits, in the same layout and naming.
- No secrets in code. A lock `value_ref` such as `secret:password`, and any `params` value `secret:<name>` of a `step:<id>` or `custom:<id>`, is a secret ref: never copy it literally; read it from the env var or fixture the project already uses for secrets.
- Never edit `.qua/project.yaml` or other `.qua/` files: cases, locks, the map, `.qua/steps.yaml`, `.qua/actions.yaml`.
- Never change a case or a lock to make a test pass.
- Never put code, paths or source notes into `qua_do` or `qua_case_write`.

## Steps

1. Pick cases: `qua_case_list(suite?)` for a suite or everything. For each case read `qua_case_get(suite, name)` and the lock `qua_case_resolved(suite, case)`.
   - No lock (`locked` false): the case never passed. Say so and suggest `qua_run` first; generate nothing for it unless the user asks for a skeleton of `TODO(qua)` lines.
2. Find the test code: this repo, or a source in `project.sources` whose note names the tests (for example "e2e tests (Playwright)"). A target outside the project root needs the user's yes before you write there; a `repo` without a local `path` cannot be written, say so. Read the target framework there: runner and config, test layout, page objects or screens, locator style, helpers, fixtures, step definitions, how base URLs and secrets are configured, and the test command. If there is no test framework, offer `qua generate` (Playwright TS) instead and stop.
3. Get context for each locked step:
   - `page` and `state`: `qua_map_get(page?)` and `qua_map_state(fp)` for the page route, states and elements. The map may be missing (it is gitignored); then use the lock alone.
   - A Playwright reference for one case: run `qua generate --suite <suite> --case <name> --stdout` in a terminal. It writes nothing. Translate it; do not copy it into a non-Playwright repo.
4. Map Qua onto the framework:
   - Page and state: the page object, screen or fixture for that route; add a method or field to the existing one before making a new class.
   - Element (`map_id`, `locator` `{by, role, value, exact, nth}`, `css_fallback`): the framework's locator in the project's style, e.g. `getByRole('button', { name: 'Sign in' })`, `find_by_role`, a page-object field. Reuse a field that already targets the same element.
   - Action and `value`: the matching helper or step definition (`click`, `fill`, `select`, `assert_text`, ...). `step:<id>` is a custom step from `.qua/steps.yaml`; map it to one helper or step definition, its `sub_steps` show the lines it expands to. `custom:<id>` is a custom action from `.qua/actions.yaml` with code in `.qua/actions/<id>.mjs`; port it to one helper and keep its `params`.
   - Stage: the base-URL or environment config the project already uses (`qua_project_get` lists `app_url` and `stages`). No hard-coded hosts in tests.
   - A `stale` step (prose edited since it passed) or an unresolved step: keep its place as an explicit `TODO(qua): <reason>` comment with the prose; never guess it.
5. Write one test per case, named after it, in the project's layout. Keep the case's step order and its assertions.
6. Verify: run the project's own test command on the touched specs only. Fix failures in your code until green. If a failure needs data, access or a step you cannot resolve, leave a `TODO(qua): <reason>` there and move on.
7. Report in chat:
   - Generated: files and tests written, per case.
   - Reused: page objects, fields, helpers and steps you used as they were.
   - Added: new helpers, fields or steps.
   - Open: every `TODO(qua)` with its case, step and reason, and the test command's result.
