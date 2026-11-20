import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { hitRegex, parseUrl, reasonFor, targetsOf } from '../hooks/guard.ts'
import { project } from './fixtures.ts'

type Ran = { tool: string; agentId?: string }

// Stubs the world beneath the plugin; records tools that reached the engine.
function world(on: On, env: Record<string, string> = {}, store: Record<string, unknown> = {}, quaUp = true) {
  const ran: Ran[] = []
  const mcp: string[] = []
  mock.env(on, env)
  mock.store(on, store)
  mock.clock(on, { now: Date.parse('2026-11-09T10:00:00Z') })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.cwd', () => ({ value: '/proj' }) as never)
  on('mcp.call', (_, e) => {
    mcp.push(`${e.server}/${e.tool}`)
    if (!quaUp) return { deny: `no server ${e.server}` }
    if (e.tool === 'qua_project_get') return { value: { content: [], isError: false, structuredContent: project } } as never
    return { value: { content: [{ type: 'text', text: 'ok' }], isError: false } } as never
  })
  on('tool.call', (_, e) => {
    ran.push({ tool: e.tool, agentId: e.agentId })
    return { result: 'ran' } as never
  })
  on('tool.check', () => ({ decision: 'allow' }))
  return { ran, mcp }
}

const denied = (r: { deny?: string; isError?: boolean; text?: string }) => r.deny ?? (r.isError ? r.text : undefined)

const BROWSER = [
  'mcp__Claude_Browser__navigate',
  'mcp__claude-in-chrome__computer',
  'mcp__remote-devices__Claude_Browser__navigate',
  'mcp__playwright__browser_navigate',
  'mcp__plugin_playwright_playwright__browser_click',
  'enable__mcp__claude-in-chrome',
]

const BASH_DENY = [
  'curl -s http://localhost:5173/login',
  'curl 127.0.0.1:5173/api/cart',
  'wget -qO- https://shop.example.com/',
  'open http://localhost:5173',
  'npx playwright open http://localhost:5173',
  'npx playwright screenshot https://example.org shot.png',
  "node -e \"fetch('http://localhost:5173').then(r=>r.text())\"",
  'cd web && /usr/bin/curl -I http://[::1]:5173',
  'qua session list && curl localhost:5173',
  'U=http://localhost:5173; curl $U',
]

const BASH_ALLOW = [
  'curl -s https://api.github.com/repos',
  'curl http://localhost:8080/health',
  'git status',
  'grep -rn localhost:5173 src/',
  'npm run dev',
  'npx playwright test',
  'qua do "open http://localhost:5173"',
]

test('pure: targets from qua_project_get, host and port matching', async () => {
  const t = targetsOf(project)
  expect(t.url).toBe('http://localhost:5173')
  expect(t.targets).toEqual([{ host: 'localhost', port: '5173' }, { host: 'localhost', port: '5173' }, { host: 'shop.example.com', port: undefined }])
  expect(parseUrl('https://u:p@[::1]:8443/x')).toEqual({ host: '[::1]', port: '8443' })
  const re = hitRegex(t.targets)
  expect(re.test('curl http://0.0.0.0:5173')).toBe(true)
  expect(re.test('curl http://localhost:51730')).toBe(false)
  expect(re.test('curl https://notshop.example.com.evil')).toBe(false)
  expect(re.test('curl https://shop.example.com.evil')).toBe(true)
  // No app_url: any loopback port counts.
  expect(hitRegex([]).test('curl localhost:3000')).toBe(true)
  expect(reasonFor('mcp__plugin_qua_qua__qua_do', {}, t.targets)).toBeUndefined()
})

test('off by default: every route runs', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  for (const tool of BROWSER) expect(denied(await $.tool.call({ tool } as never))).toBeUndefined()
  for (const command of BASH_DENY) expect(denied(await $.tool.call({ tool: 'Bash', command } as never))).toBeUndefined()
  expect(w.ran.length).toBe(BROWSER.length + BASH_DENY.length)
  expect(w.mcp).toEqual([])
})

test('QUA_GUARD=1 denies browser MCP tools and points to Qua', async ($, on) => {
  const w = world(on, { QUA_GUARD: '1' })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  for (const tool of BROWSER) {
    const why = denied(await $.tool.call({ tool } as never))
    expect(why).toMatch(/qua-guard/)
    expect(why).toMatch(/qua_do/)
    expect(why).toMatch(/qua_run/)
    expect(why).toMatch(/qua_explore/)
  }
  expect(w.ran).toEqual([])
})

test('QUA_GUARD=1 denies Bash and WebFetch aimed at app_url, allows the rest', async ($, on) => {
  const w = world(on, { QUA_GUARD: 'on' })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  for (const command of BASH_DENY) expect([command, denied(await $.tool.call({ tool: 'Bash', command } as never))]).toEqual([command, expect.stringMatching(/^qua-guard: .*localhost:5173/)])
  for (const command of BASH_ALLOW) expect([command, denied(await $.tool.call({ tool: 'Bash', command } as never))]).toEqual([command, undefined])
  expect(denied(await $.tool.call({ tool: 'WebFetch', url: 'https://shop.example.com/cart', prompt: 'x' } as never))).toMatch(/WebFetch/)
  expect(denied(await $.tool.call({ tool: 'WebFetch', url: 'https://docs.example.com', prompt: 'x' } as never))).toBeUndefined()
  expect(w.ran.map(r => r.tool)).toEqual([...BASH_ALLOW.map(() => 'Bash'), 'WebFetch'])
  // app_url is read once per session through qua_project_get.
  expect(w.mcp).toEqual(['plugin:qua:qua/qua_project_get'])
})

test('Qua tools and other tools keep working with the guard on', async ($, on) => {
  const w = world(on, { QUA_GUARD: '1' })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  for (const tool of ['mcp__plugin_qua_qua__qua_do', 'mcp__plugin_qua_qua__qua_run', 'mcp__plugin_qua_qua__qua_explore', 'mcp__qua__qua_session_list', 'Read']) {
    expect(denied(await $.tool.call({ tool } as never))).toBeUndefined()
  }
  expect(w.ran.length).toBe(5)
})

test('subagent calls are denied too', async ($, on) => {
  const w = world(on, { QUA_GUARD: '1' })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(denied(await $.tool.call({ tool: 'mcp__Claude_Browser__navigate', agentId: 'a1' } as never))).toMatch(/qua-guard/)
  expect(denied(await $.tool.call({ tool: 'Bash', command: 'curl localhost:5173', agentId: 'a1' } as never))).toMatch(/qua-guard/)
  expect(w.ran).toEqual([])
})

test('tool.check answers deny for guarded routes and leaves others to the engine', async ($, on) => {
  world(on, { QUA_GUARD: '1' })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect((await $.tool.check({ tool: 'mcp__claude-in-chrome__navigate', input: { url: 'http://localhost:5173' } })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'wget localhost:5173' } })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__plugin_qua_qua__qua_do', input: {} })).decision).toBe('allow')
})

test('/qua-guard on|off|status switches it; only a person may', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const run = (args: string, kind = 'composer') => $.command.run({ command: 'qua-guard', args, origin: { kind } } as never)
  expect((await run('status')).text).toBe('qua-guard off')
  expect((await run('on')).text).toBe('qua-guard on for http://localhost:5173')
  expect(denied(await $.tool.call({ tool: 'mcp__Claude_Browser__navigate' } as never))).toMatch(/qua-guard/)
  expect((await run('off', 'plugin')).text).toMatch(/only you can switch it/)
  expect((await run('off')).text).toBe('qua-guard off')
  expect(denied(await $.tool.call({ tool: 'mcp__Claude_Browser__navigate' } as never))).toBeUndefined()
  expect(w.ran.length).toBe(1)
})

test('stored on is read at session start; QUA_GUARD=0 overrides it', async ($, on) => {
  world(on, { QUA_GUARD: '0' }, { 'guard:/proj': true })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(denied(await $.tool.call({ tool: 'mcp__playwright__browser_click' } as never))).toBeUndefined()
  const r = await $.command.run({ command: 'qua-guard', args: 'on', origin: { kind: 'composer' } } as never)
  expect(r.text).toMatch(/from QUA_GUARD/)
})

test('the model cannot lift the guard through the Skill tool', async ($, on) => {
  world(on, { QUA_GUARD: '1' })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(denied(await $.tool.call({ tool: 'Skill', skill: 'qua-guard', args: 'off' } as never))).toMatch(/only the user/)
  expect(denied(await $.tool.call({ tool: 'Skill', skill: 'qua:qua' } as never))).toBeUndefined()
})

test('without a qua server it guards loopback hosts and asks again only after 30 s', async ($, on) => {
  const w = world(on, { QUA_GUARD: '1' }, {}, false)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(denied(await $.tool.call({ tool: 'Bash', command: 'curl localhost:3000' } as never))).toMatch(/qua-guard/)
  expect(denied(await $.tool.call({ tool: 'Bash', command: 'curl https://shop.example.com' } as never))).toBeUndefined()
  expect(w.mcp.length).toBe(2)
})
