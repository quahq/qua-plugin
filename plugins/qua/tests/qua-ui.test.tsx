import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { diffProject, toDraft } from '../hooks/model.ts'
import { answers, project } from './fixtures.ts'

const pane = (id: string) =>
  ({
    plugin: 'qua',
    component: 'Pane',
    requestId: id,
    viewport: { columns: 140, rows: 40 },
    props: { title: id, isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

const BAND = {
  plugin: 'qua',
  component: 'AbovePrompt',
  viewport: { columns: 140, rows: 40 },
  props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

// Stubs the engine and the qua server; returns every MCP call the mod made.
function engine(on: On, servers: string[] = ['plugin:qua:qua'], filled: string[] = []) {
  const calls: { server: string; tool: string; args: Record<string, unknown> }[] = []
  mock.clock(on, { now: Date.parse('2026-11-09T10:01:00Z') })
  mock.env(on, {})
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('session.version', () => ({ value: { version: '2.1.318', base: '2.1.318' } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('mcp.call', (_, e) => {
    calls.push({ server: e.server, tool: e.tool, args: e.args })
    if (!servers.includes(e.server)) return { deny: `no server ${e.server}` }
    if (e.tool === 'qua_project_set') {
      const p = { ...project, project: { ...project.project, ...e.args } }
      return { value: { content: [{ type: 'text', text: 'saved' }], isError: false, structuredContent: p } } as never
    }
    return { value: answers[e.tool] ?? { content: [{ type: 'text', text: 'unknown tool' }], isError: true } } as never
  })
  return calls
}

const READ_ONLY = ['qua_project_get', 'qua_session_list', 'qua_session_logs', 'qua_session_screenshot', 'qua_run_list', 'qua_run_get', 'qua_shot_get']

test('sessions pane lists sessions on terminal and desktop with reads only', async ($, on) => {
  const calls = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'qua-ui', args: '' } as never)
  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...pane('qua-sessions'), surface })
    expect(await ui.find({ type: 'Text', text: /shop-dev/ })).toBeDefined()
    expect(await ui.find({ key: 'shot-smoke-login' })).toBeDefined()
    await ui.unmount()
  }
  expect(calls.every(c => READ_ONLY.includes(c.tool))).toBe(true)
})

test('Close puts a request in the prompt and calls no tool', async ($, on) => {
  const filled: string[] = []
  const calls = engine(on, ['plugin:qua:qua'], filled)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'qua-ui', args: '' } as never)
  const ui = await $.ui.mount({ ...pane('qua-sessions'), surface: 'terminal' })
  await ui.press({ key: 'close-shop-dev' })
  expect(filled[0]).toContain('"shop-dev"')
  expect(calls.some(c => c.tool === 'qua_session_close')).toBe(false)
  await ui.unmount()
})

test('falls back to the next server name', async ($, on) => {
  const calls = engine(on, ['qua'])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'qua-ui', args: 'probe' } as never)
  expect(String(out.text)).toContain('qua_project_get via qua: isError=false structured=true')
  expect(calls[0]?.server).toBe('plugin:qua:qua')
})

test('run pane shows steps with status and reason', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'qua-ui', args: 'run' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('qua-run'), surface })
    expect(await ui.find({ type: 'Text', text: /3\. click Sign in/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /button is disabled/ })).toBeDefined()
    expect(await ui.find({ key: 'step-shot-2' })).toBeDefined()
    await ui.unmount()
  }
})

test('band shows a qua run while it is in flight', async ($, on) => {
  engine(on)
  let release = () => {}
  const held = new Promise<void>(r => (release = r))
  on('tool.call', async () => {
    await held
    return { result: { content: [{ type: 'text', text: 'done' }], structuredContent: { session: 's', status: 'passed', cases: [] } } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const running = $.tool.call({ tool: 'mcp__plugin_qua_qua__qua_run', suite: 'smoke', case: 'login' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: 'smoke/login' })).toBeDefined()
    expect(await ui.find({ key: 'band-run' })).toBeDefined()
    await ui.unmount()
  }
  release()
  await running
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ key: 'band-run' })).toBeUndefined()
  await after.unmount()
})

test('a qua_do result lands in the run pane', async ($, on) => {
  engine(on)
  on('tool.call', () => ({
    result: { content: [{ type: 'text', text: 'failed' }], structuredContent: { status: 'failed', prose: 'click Buy', reason: 'not found' } },
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__plugin_qua_qua__qua_do', action: 'click Buy' })
  const ui = await $.ui.mount({ ...pane('qua-run'), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /click Buy — not found/ })).toBeDefined()
  await ui.unmount()
})

test('Shot draws an Svg on desktop and an Image in the terminal', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'qua-ui', args: '' } as never)
  const sessionsPane = await $.ui.mount({ ...pane('qua-sessions'), surface: 'desktop' })
  await sessionsPane.press({ key: 'shot-shop-dev' })
  await sessionsPane.unmount()
  const desk = await $.ui.mount({ ...pane('qua-shot'), surface: 'desktop' })
  const svg = await desk.find({ type: 'Svg' })
  expect(String(svg?.props.source)).toContain('data:image/png;base64,')
  await desk.unmount()
  const term = await $.ui.mount({ ...pane('qua-shot'), surface: 'terminal' })
  expect((await term.find({ key: 'shot-image' }))?.props.source).toEqual({ file: '/tmp/shop-dev.png', format: 'png' })
  await term.unmount()
})

test('config pane shows no phantom change and saves only what changed', async ($, on) => {
  const calls = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'qua-config', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane('qua-config'), surface })
    expect(await ui.find({ type: 'Text', text: 'No changes' })).toBeDefined()
    expect(await ui.find({ key: 'cfg-save' })).toBeUndefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...pane('qua-config'), surface: 'desktop' })
  await ui.input({ key: 'cfg-app-url', text: 'http://localhost:3000', kind: 'change' })
  expect(calls.some(c => c.tool === 'qua_project_set')).toBe(false)
  await ui.press({ key: 'cfg-save' })
  const sets = calls.filter(c => c.tool === 'qua_project_set')
  expect(sets.length).toBe(1)
  expect(sets[0]?.args).toEqual({ app_url: 'http://localhost:3000' })
  expect(await ui.find({ type: 'Text', text: /saved: app_url/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No changes' })).toBeDefined()
  await ui.unmount()
})

test('diff sends a removed integration as null and stages as a whole map', () => {
  const d = toDraft(project.project)
  d.integrations.source_control = { provider: '', status: '', keys: '' }
  d.stages = d.stages.filter(([k]) => k !== 'prod')
  const { args, changed } = diffProject(project.project, d)
  expect(changed).toEqual(['stages', 'integrations.source_control'])
  expect(args).toEqual({ stages: { dev: 'http://localhost:5173' }, integrations: { source_control: null } })
})
