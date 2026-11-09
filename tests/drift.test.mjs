// Skills and mods vs the vendored tool contract (ADR 0054).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const plugin = join(root, 'plugins/qua')
const read = (p) => readFileSync(join(root, p), 'utf8')

const contract = JSON.parse(read('contract/tools.json'))
const tools = new Map(
  contract.tools.filter((t) => t.server === 'qua' && t.name).map((t) => [t.name, t]),
)
const shipped = [...tools.values()].filter((t) => t.status === 'shipped').map((t) => t.name)

const skills = Object.fromEntries(
  readdirSync(join(plugin, 'skills')).map((d) => [d, read(`plugins/qua/skills/${d}/SKILL.md`)]),
)

const bare = /`(qua_[a-z_]+)`/g
const sig = /`(qua_[a-z_]+)\(([^)]*)\)`/g
const argNames = new Set([...tools.values()].flatMap((t) => t.args.map((a) => a.replace(/\?$/, ''))))
const fields = new Set(['qua_version', 'qua_env']) // result fields, not tools

// Backticked qua_* tokens that are tool names, not argument names.
function named(body) {
  const out = new Set()
  for (const [, n] of body.matchAll(sig)) out.add(n)
  for (const [, n] of body.matchAll(bare)) if (tools.has(n) || !(argNames.has(n) || fields.has(n))) out.add(n)
  return out
}

test('contract source is recorded', () => {
  assert.match(read('contract/SOURCE'), /^qua-core v\S+ [0-9a-f]{40}\n$/)
  assert.ok(shipped.length >= 20, `only ${shipped.length} shipped qua tools`)
})

test('every shipped qua tool is documented in the qua skill', () => {
  const body = skills.qua
  const missing = shipped.filter((n) => !new RegExp('`' + n + '[`(]').test(body))
  assert.deepEqual(missing, [], 'add these to plugins/qua/skills/qua/SKILL.md ## Tools')
})

test('every tool a skill names exists in the contract', () => {
  const unknown = []
  for (const [skill, body] of Object.entries(skills))
    for (const n of named(body)) if (!tools.has(n)) unknown.push(`${skill}: ${n}`)
  assert.deepEqual(unknown, [])
})

test('tool signatures in skills match contract args', () => {
  const errs = []
  let count = 0
  for (const [skill, body] of Object.entries(skills)) {
    for (const [, n, raw] of body.matchAll(sig)) {
      count++
      const t = tools.get(n)
      if (!t) continue
      const spec = new Map(t.args.map((a) => [a.replace(/\?$/, ''), a.endsWith('?')]))
      const listed = new Set()
      for (let a of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        const opt = a.endsWith('?')
        a = a.replace(/\?$/, '')
        listed.add(a)
        if (!spec.has(a)) errs.push(`${skill}: ${n} arg ${a} not in contract`)
        else if (opt && !spec.get(a)) errs.push(`${skill}: ${n} marks required ${a} optional`)
      }
      for (const [a, opt] of spec) if (!opt && !listed.has(a)) errs.push(`${skill}: ${n} misses required ${a}`)
    }
  }
  assert.deepEqual(errs, [])
  assert.ok(count >= 7, `found ${count} signatures`)
})

test('mod calls only contract tools', () => {
  const model = read('plugins/qua/hooks/model.ts')
  const reads = model.match(/READS = new Set\(\[([^\]]*)\]/)[1]
  const write = model.match(/WRITE = '([a-z_]+)'/)[1]
  const calls = [...reads.matchAll(/'(qua_[a-z_]+)'/g)].map((m) => m[1]).concat(write)
  assert.ok(calls.length >= 5)
  assert.deepEqual(calls.filter((n) => !tools.has(n)), [])
})

test('hooks.json stays loadable by hosts without mods', () => {
  // Claude Code < 2.1.287 drops the plugin's MCP server when "hooks" is absent.
  const h = JSON.parse(read('plugins/qua/hooks/hooks.json'))
  assert.deepEqual(h.hooks, {})
  assert.ok(Array.isArray(h.modules) && h.modules.length === 1)
})

test('plugin version matches the version qua-init gates on', () => {
  const v = JSON.parse(read('plugins/qua/.claude-plugin/plugin.json')).version
  assert.match(v, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
  assert.ok(skills['qua-init'].includes(`This plugin was built for qua v${v}.`))
})
