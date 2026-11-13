import type { EngineInterface, On } from 'claude-code'

// qua-guard (PoC, quahq/qua-decisions#22): opt-in deny of non-Qua browser routes to the app.

export const BROWSER_MCP = /^mcp__(Claude_Browser|claude-in-chrome|remote-devices__Claude_Browser|(?:[^_]|_(?!_))*playwright(?:[^_]|_(?!_))*)__/i
export const BROWSER_ENABLE = /^enable__mcp__(claude-in-chrome|remote-devices__Claude_Browser)$/
export const BROWSER_SERVER = /^(Claude_Browser|Claude Browser|claude-in-chrome)$|playwright/i
const QUA_PROJECT_WRITE = /^mcp__(plugin_qua_qua|qua)__(qua_project_(set|configure)|init)$/
const SERVERS = ['plugin:qua:qua', 'qua']
const LOOPBACK = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']
const FETCHERS = /(^|[\s;&|()`$'"/=])(curl|wget|open|xdg-open|node|npx|bunx?|deno|python3?|http|https|xh|playwright)(?=[\s;&|)]|$)/
const PW_BROWSER = /\bplaywright\s+(open|codegen|cr|ff|wk|screenshot|pdf)\b/

export type Target = { host: string; port?: string }

let enabled: boolean | undefined
let fromEnv = false
let targets: Target[] | undefined
let appUrl = ''
let retryAt = 0

export function parseUrl(url: string): Target | undefined {
  const m = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#]*@)?(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i.exec(url.trim())
  return m ? { host: m[2].toLowerCase(), port: m[3] } : undefined
}

export function targetsOf(project: unknown): { url: string; targets: Target[] } {
  const p = (project as { project?: { app_url?: string; stages?: Record<string, string> | null } } | undefined)?.project
  const urls = [p?.app_url ?? '', ...Object.values(p?.stages ?? {})].filter(Boolean)
  return { url: p?.app_url ?? '', targets: urls.map(parseUrl).filter((t): t is Target => !!t) }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// One regex for the hosts; loopback names stand for each other.
export function hitRegex(ts: Target[]): RegExp {
  const parts = new Set<string>()
  const list = ts.length ? ts : [{ host: 'localhost' }]
  for (const t of list) {
    const hosts = LOOPBACK.includes(t.host) ? LOOPBACK : [t.host]
    for (const h of hosts) parts.add(t.port && ts.length ? `${esc(h)}:${t.port}(?!\\d)` : `${esc(h)}(?![a-z0-9-])`)
  }
  return new RegExp(`(^|[^a-z0-9.-])(${[...parts].join('|')})`, 'i')
}

// Why a call reaches the app around Qua, or undefined.
export function reasonFor(tool: string, args: Record<string, unknown>, ts: Target[]): string | undefined {
  if (BROWSER_MCP.test(tool) || BROWSER_ENABLE.test(tool)) return `${tool} drives a browser`
  if (tool === 'Bash') {
    // Segments that run the qua CLI are Qua's own route.
    const cmd = String(args.command ?? '')
      .split(/;|&&|\|\||\||\n/)
      .filter(seg => !/^\s*(\S*\/)?qua\s/.test(seg))
      .join(' ; ')
    if (PW_BROWSER.test(cmd)) return 'Bash runs a Playwright browser'
    if (FETCHERS.test(cmd) && hitRegex(ts).test(cmd)) return 'Bash reaches the app under test'
  }
  if (tool === 'WebFetch' && hitRegex(ts).test(String(args.url ?? ''))) return 'WebFetch reaches the app under test'
  return undefined
}

export function denyText(why: string, url: string): string {
  return (
    `qua-guard: ${why}${url ? ` (${url})` : ''}. In this project browser work on the app goes through Qua: ` +
    'qua_do for one step, qua_run for a saved case or suite, qua_explore to look around. ' +
    'Do not retry this another way; if Qua cannot do it, tell the user (they can run /qua-guard off).'
  )
}

const storeKey = async ($: EngineInterface) => `guard:${await $.session.cwd()}`

export async function isOn($: EngineInterface): Promise<boolean> {
  if (enabled !== undefined) return enabled
  const v = ((await $.env.get('QUA_GUARD')) ?? '').toLowerCase()
  fromEnv = ['1', 'on', 'true', '0', 'off', 'false'].includes(v)
  enabled = fromEnv ? ['1', 'on', 'true'].includes(v) : (await $.store.get(await storeKey($))) === true
  return enabled
}

async function loadTargets($: EngineInterface): Promise<Target[]> {
  if (targets) return targets
  const now = await $.clock.now()
  if (now < retryAt) return []
  for (const name of SERVERS) {
    try {
      const r = (await $.mcp.call(name, 'qua_project_get', {})) as { structuredContent?: unknown; isError?: boolean }
      if (r.isError) continue
      const t = targetsOf(r.structuredContent)
      appUrl = t.url
      targets = t.targets
      return targets
    } catch {
      // Next server name; loopback fallback below.
    }
  }
  retryAt = now + 30_000
  return []
}

async function judge($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<string | undefined> {
  if (!(await isOn($))) return undefined
  const needsApp = tool === 'Bash' || tool === 'WebFetch'
  const why = reasonFor(tool, args, needsApp ? await loadTargets($) : [])
  return why && denyText(why, appUrl)
}

const GUARDED = { tool: [BROWSER_MCP, BROWSER_ENABLE, 'Bash', 'WebFetch'] }
const HUMAN = new Set(['composer', 'bridge', 'sdk'])

// Called from the plugin's one session.start hook.
export async function startGuard($: EngineInterface): Promise<void> {
  await $.command.register({ name: 'qua-guard', description: 'Keep browser work on the app under test on Qua tools', argumentHint: '[on|off|status]', immediate: true })
}

export function registerGuard(on: On): void {
  on('command.run', { command: 'qua-guard' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    const on_ = await isOn($)
    if (arg === 'on' || arg === 'off') {
      if (!HUMAN.has(e.origin.kind)) return { text: `qua-guard: only you can switch it (${e.origin.kind} asked)` }
      if (fromEnv) return { text: `qua-guard is ${on_ ? 'on' : 'off'} from QUA_GUARD; change the env var` }
      enabled = arg === 'on'
      await $.store.set(await storeKey($), enabled)
      if (enabled) {
        targets = undefined
        retryAt = 0
      }
    }
    const ts = enabled ? await loadTargets($) : []
    const where = enabled ? ` for ${appUrl || (ts.length ? 'stages' : 'loopback hosts (no app_url)')}` : ''
    return { text: `qua-guard ${enabled ? 'on' : 'off'}${where}${fromEnv ? ' (QUA_GUARD)' : ''}` }
  })

  on('tool.call', GUARDED, async ($, e, next) => {
    const deny = await judge($, e.tool, e as unknown as Record<string, unknown>)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => (next.called || !enabled ? next(e) : { deny: denyText('its check failed', appUrl) }))

  on('tool.check', GUARDED, async ($, e, next) => {
    const deny = await judge($, e.tool, (e.input ?? {}) as Record<string, unknown>)
    return deny ? { decision: 'deny', reason: deny } : next(e)
  }).catch(($, e, next) => (enabled ? { decision: 'deny', reason: denyText('its check failed', appUrl) } : next(e)))

  // Other plugins' $.mcp.call to a browser server.
  on('mcp.call', { server: BROWSER_SERVER }, async ($, e, next) =>
    (await isOn($)) ? { deny: denyText(`${e.server} drives a browser`, appUrl) } : next(e),
  ).catch(($, e, next) => (next.called || !enabled ? next(e) : { deny: denyText('its check failed', appUrl) }))

  // The model may not lift the guard through the Skill tool.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const name = String((e as unknown as { skill?: string }).skill ?? '')
    return /qua-guard/.test(name) && (await isOn($)) ? { deny: 'qua-guard: only the user switches the guard' } : next(e)
  }).catch(($, e, next) => (next.called || !enabled ? next(e) : { deny: 'qua-guard: its check failed' }))

  on('tool.call', { tool: QUA_PROJECT_WRITE }, async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      targets = undefined
    }
  }).catch(($, e, next) => next(e))
}
