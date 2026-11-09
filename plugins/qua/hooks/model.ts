// Pure helpers for the qua-ui mod: result parsing, diffs, formatting.

export const READS = new Set([
  'qua_project_get',
  'qua_session_list',
  'qua_session_logs',
  'qua_session_screenshot',
  'qua_run_list',
  'qua_run_get',
  'qua_shot_get',
])
export const WRITE = 'qua_project_set'
export const SERVERS = ['plugin:qua:qua', 'qua']
export const QUA_ACT = /^mcp__.+__(qua_)?(run|do|explore)$/
export const SVG_MAX = 131072

export type Block = { type: string; text?: string; data?: string; mimeType?: string }
export type McpResult = { content?: Block[]; isError?: boolean; structuredContent?: unknown }

export type Session = {
  name: string
  browser: string
  window?: string
  last_used_at?: string
  finished_at?: string
  result?: string
  owner?: string
  kind?: string
}

export type SubStep = { prose: string; status: string; reason?: string }
export type Step = {
  prose: string
  status: string
  reason?: string
  shot?: string
  sub_steps?: SubStep[] | null
}
export type RunRow = {
  id: string
  suite: string
  case: string
  status: string
  started_at: string
  duration_ms: number
  steps: number
  passed: number
}
export type Run = RunRow & {
  live: boolean
  error?: string
  shots?: string[] | null
  steps_list: Step[]
}

export type Integration = { provider?: string; status: string; keys?: Record<string, string> | null }
export type Project = {
  app_url: string
  stages: Record<string, string> | null
  qua_env: string
  integrations: Record<string, Integration> | null
  other: string[] | null
}
export type BrowserRow = { agent: string; browsers: { type: string; engine?: string; status: string; default: boolean }[] | null }
export type ProjectView = { project: Project; browsers: BrowserRow[]; qua_version: string; configured: boolean }

export type Draft = {
  app_url: string
  qua_env: string
  stages: [string, string][]
  integrations: Record<string, { provider: string; status: string; keys: string }>
  other: string
}

export const CATEGORIES = ['qua', 'source_control', 'issue_tracker', 'test_management', 'knowledge_base']

export function textOf(r: McpResult | undefined): string {
  return (r?.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('\n')
}

export function imageOf(r: McpResult | undefined): Block | undefined {
  return (r?.content ?? []).find(b => b.type === 'image' && typeof b.data === 'string')
}

// Structured data from an MCP result or a tool.call result of unknown shape.
export function structuredOf(x: unknown, depth = 0): unknown {
  if (x == null || depth > 4) return undefined
  if (typeof x === 'string') {
    try {
      const v = JSON.parse(x)
      return typeof v === 'object' && v !== null ? v : undefined
    } catch {
      return undefined
    }
  }
  if (Array.isArray(x)) {
    for (const b of x) {
      if (b && typeof b === 'object' && (b as Block).type === 'text') {
        const v = structuredOf((b as Block).text, depth + 1)
        if (v) return v
      }
    }
    return undefined
  }
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>
    if (o.structuredContent && typeof o.structuredContent === 'object') return o.structuredContent
    for (const k of ['result', 'content', 'text']) {
      if (k in o) {
        const v = structuredOf(o[k], depth + 1)
        if (v) return v
      }
    }
    if ('status' in o || 'cases' in o || 'sessions' in o) return o
  }
  return undefined
}

// Keys at each level, to report what a tool.call result looks like.
export function shapeOf(x: unknown, depth = 0): string {
  if (x === null) return 'null'
  if (Array.isArray(x)) return depth > 2 ? 'array' : `[${x.length ? shapeOf(x[0], depth + 1) : ''}]`
  if (typeof x !== 'object') return typeof x
  if (depth > 2) return 'object'
  const o = x as Record<string, unknown>
  return '{' + Object.keys(o).slice(0, 12).map(k => `${k}:${shapeOf(o[k], depth + 1)}`).join(',') + '}'
}

export function glyph(status: string): { mark: string; color?: string } {
  switch (status) {
    case 'passed':
    case 'pass':
    case 'ok':
    case 'done':
      return { mark: '✓', color: 'green' }
    case 'failed':
    case 'fail':
    case 'error':
      return { mark: '✗', color: 'red' }
    case 'review':
      return { mark: '?', color: 'yellow' }
    case 'running':
      return { mark: '…', color: 'cyan' }
    default:
      return { mark: '·' }
  }
}

export function age(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export function seconds(ms: number): string {
  return ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`
}

export function toRun(v: unknown): Run | undefined {
  const o = v as Record<string, unknown> | undefined
  if (!o || typeof o.id !== 'string') return undefined
  return {
    id: o.id,
    suite: String(o.suite ?? ''),
    case: String(o.case ?? ''),
    status: String(o.status ?? ''),
    started_at: String(o.started_at ?? ''),
    duration_ms: Number(o.duration_ms ?? 0),
    steps: Array.isArray(o.steps) ? o.steps.length : 0,
    passed: Array.isArray(o.steps) ? (o.steps as Step[]).filter(s => s.status === 'passed').length : 0,
    live: Boolean(o.live),
    error: typeof o.error === 'string' ? o.error : undefined,
    shots: (o.shots as string[] | null) ?? null,
    steps_list: Array.isArray(o.steps) ? (o.steps as Step[]) : [],
  }
}

// Steps of a finished qua_run or qua_do result (RunResult or StepResult).
export function stepsOfResult(v: unknown): { label: string; status: string; steps: Step[] } | undefined {
  const o = v as Record<string, unknown> | undefined
  if (!o) return undefined
  if (Array.isArray(o.cases)) {
    const cases = o.cases as { suite: string; case: string; status: string; steps?: Step[] | null }[]
    const steps = cases.flatMap(c => c.steps ?? [])
    const label = cases.map(c => `${c.suite}/${c.case}`).join(', ')
    return { label, status: String(o.status ?? ''), steps }
  }
  if (typeof o.status === 'string' && typeof o.prose === 'string') {
    const sub = (o.sub as SubStep[] | null | undefined) ?? null
    return { label: o.prose, status: o.status, steps: [{ prose: o.prose, status: o.status, reason: o.reason as string | undefined, shot: o.screenshot as string | undefined, sub_steps: sub }] }
  }
  return undefined
}

export function toDraft(p: Project): Draft {
  const integrations: Draft['integrations'] = {}
  for (const c of CATEGORIES) {
    const i = p.integrations?.[c]
    integrations[c] = {
      provider: i?.provider ?? '',
      status: i?.status ?? '',
      keys: Object.entries(i?.keys ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(', '),
    }
  }
  return {
    app_url: p.app_url ?? '',
    qua_env: p.qua_env ?? '',
    stages: Object.entries(p.stages ?? {}),
    integrations,
    other: (p.other ?? []).join(', '),
  }
}

function keysOf(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of s.split(',')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}

function stagesOf(rows: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of rows) if (k.trim() && v.trim()) out[k.trim()] = v.trim()
  return out
}

function listOf(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b))
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sortDeep((v as Record<string, unknown>)[k])]))
  }
  return v
}

// qua_project_set args for the draft's changes; empty when none.
export function diffProject(base: Project, d: Draft): { args: Record<string, unknown>; changed: string[] } {
  const was = toDraft(base)
  const args: Record<string, unknown> = {}
  const changed: string[] = []
  if (d.app_url.trim() !== was.app_url.trim()) {
    args.app_url = d.app_url.trim()
    changed.push('app_url')
  }
  if (d.qua_env !== was.qua_env) {
    args.qua_env = d.qua_env
    changed.push('qua_env')
  }
  if (!same(stagesOf(d.stages), stagesOf(was.stages))) {
    args.stages = stagesOf(d.stages)
    changed.push('stages')
  }
  const integ: Record<string, unknown> = {}
  for (const c of CATEGORIES) {
    const a = d.integrations[c]
    const b = was.integrations[c]
    if (!a || !b) continue
    const next = { provider: a.provider.trim(), status: a.status, keys: keysOf(a.keys) }
    const prev = { provider: b.provider.trim(), status: b.status, keys: keysOf(b.keys) }
    if (same(next, prev)) continue
    changed.push(`integrations.${c}`)
    if (!next.status) {
      integ[c] = null
      continue
    }
    const v: Record<string, unknown> = { status: next.status }
    if (next.provider) v.provider = next.provider
    if (Object.keys(next.keys).length) v.keys = next.keys
    integ[c] = v
  }
  if (Object.keys(integ).length) args.integrations = integ
  if (!same(listOf(d.other), listOf(was.other))) {
    args.other = listOf(d.other)
    changed.push('other')
  }
  return { args, changed }
}

export function toProjectView(v: unknown): ProjectView | undefined {
  const o = v as Record<string, unknown> | undefined
  const p = o?.project as Project | undefined
  if (!o || !p) return undefined
  return {
    project: p,
    browsers: (o.browsers as BrowserRow[] | null) ?? [],
    qua_version: String(o.qua_version ?? ''),
    configured: Boolean(o.configured),
  }
}

// Pixel size of a base64 PNG or JPEG.
export function imageSize(b64: string): { width: number; height: number } | undefined {
  let bin: string
  try {
    bin = atob(b64.slice(0, 200000))
  } catch {
    return undefined
  }
  const at = (i: number) => bin.charCodeAt(i)
  if (bin.startsWith('\x89PNG')) {
    const w = (at(16) << 24) | (at(17) << 16) | (at(18) << 8) | at(19)
    const h = (at(20) << 24) | (at(21) << 16) | (at(22) << 8) | at(23)
    return { width: w, height: h }
  }
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2
    while (i + 9 < bin.length) {
      if (at(i) !== 0xff) return undefined
      const m = at(i + 1)
      const len = (at(i + 2) << 8) | at(i + 3)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8) }
      }
      i += 2 + len
    }
  }
  return undefined
}

// An SVG document showing one raster image, or undefined when it would not fit.
export function svgImage(b64: string, mime: string, size: { width: number; height: number }): string | undefined {
  const { width, height } = size
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<image width="${width}" height="${height}" href="data:${mime};base64,${b64}"/></svg>`
  return doc.length <= SVG_MAX ? doc : undefined
}
