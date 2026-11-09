import type { EngineInterface, Register } from 'claude-code'

import {
  age,
  CATEGORIES,
  diffProject,
  glyph,
  imageOf,
  imageSize,
  type McpResult,
  type ProjectView,
  QUA_ACT,
  READS,
  type Run,
  type RunRow,
  seconds,
  SERVERS,
  type Session,
  shapeOf,
  type Step,
  stepsOfResult,
  structuredOf,
  svgImage,
  textOf,
  toDraft,
  toProjectView,
  toRun,
  type Draft,
  WRITE,
} from './model.ts'
import { registerGuard, startGuard } from './guard.ts'

const SESSIONS = 'qua-sessions'
const RUN = 'qua-run'
const SHOT = 'qua-shot'
const CONFIG = 'qua-config'
const PANES = [SESSIONS, RUN, SHOT, CONFIG]
const POLL_MS = 3000
const LIVE_MS = 1500

type Shot = { title: string; path?: string; svg?: string; png?: string; note?: string }
type Active = { id: string; kind: string; label: string; startedAt: number; suite?: string }
type DoStep = Step & { at: number }

let server: string | undefined
let sessions: Session[] = []
let sessionsError = ''
let logs: { session: string; text: string } | undefined
let runs: RunRow[] = []
let run: Run | undefined
let runError = ''
let doSteps: DoStep[] = []
let active: Active | undefined
let shot: Shot | undefined
let view: ProjectView | undefined
let draft: Draft | undefined
let configNote = ''
let lastShape = ''
let liveTimer: { cancel: () => void } | undefined
let autoPoll = true

async function call($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<McpResult> {
  if (!READS.has(tool) && tool !== WRITE) throw new Error(`qua-ui: ${tool} is not allowed`)
  const fromEnv = await $.env.get('QUA_UI_SERVER')
  const tried: string[] = []
  const errors: string[] = []
  for (const name of [server, fromEnv, ...SERVERS]) {
    if (!name || tried.includes(name)) continue
    tried.push(name)
    try {
      const r = (await $.mcp.call(name, tool, args)) as McpResult
      server = name
      return r
    } catch (err) {
      if (name === server) server = undefined
      errors.push(`${name}: ${errText(err)}`)
    }
  }
  throw new Error(`qua-ui: no Qua MCP server answered ${tool} (${errors.join('; ')})`)
}

async function read($: EngineInterface, tool: string, args: Record<string, unknown> = {}): Promise<McpResult> {
  if (!READS.has(tool)) throw new Error(`qua-ui: ${tool} is not a read`)
  return call($, tool, args)
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function refreshSessions($: EngineInterface): Promise<void> {
  try {
    const r = await read($, 'qua_session_list')
    const v = structuredOf(r) as { sessions?: Session[] | null } | undefined
    sessions = v?.sessions ?? []
    sessionsError = r.isError ? textOf(r) : ''
    autoPoll = true
  } catch (err) {
    sessionsError = errText(err)
    // A refused call would ask again on every poll.
    autoPoll = false
  }
  $.ui.invalidate('ui.render')
}

async function refreshRuns($: EngineInterface, pick?: string): Promise<void> {
  try {
    const list = structuredOf(await read($, 'qua_run_list', { limit: 8 })) as { runs?: RunRow[] | null } | undefined
    runs = list?.runs ?? []
    const id = pick ?? run?.id ?? runs[0]?.id
    if (id) {
      const r = await read($, 'qua_run_get', { id })
      run = toRun(structuredOf(r)) ?? run
      runError = r.isError ? textOf(r) : ''
    }
  } catch (err) {
    runError = errText(err)
  }
  $.ui.invalidate('ui.render')
}

async function pollLive($: EngineInterface): Promise<void> {
  const a = active
  if (!a || a.kind !== 'run') return
  try {
    const args: Record<string, unknown> = { limit: 1 }
    if (a.suite) args.suite = a.suite
    const list = structuredOf(await read($, 'qua_run_list', args)) as { runs?: RunRow[] | null } | undefined
    const newest = list?.runs?.[0]
    if (!newest || Date.parse(newest.started_at) < a.startedAt - 5000) return
    run = toRun(structuredOf(await read($, 'qua_run_get', { id: newest.id }))) ?? run
  } catch (err) {
    runError = errText(err)
    // A refused read would ask again on every tick.
    liveTimer?.cancel()
    liveTimer = undefined
  }
  $.ui.invalidate('ui.render')
}

async function takeShot($: EngineInterface, session: string): Promise<void> {
  shot = { title: `session ${session}`, note: 'capturing…' }
  await $.ui.open({ id: SHOT, title: 'Qua shot' })
  $.ui.invalidate('ui.render')
  try {
    const r = await read($, 'qua_session_screenshot', { session, label: 'qua-ui' })
    if (r.isError) {
      shot = { title: `session ${session}`, note: textOf(r) }
    } else {
      const path = (structuredOf(r) as { path?: string } | undefined)?.path
      shot = { title: `session ${session}`, path, png: path }
      const img = imageOf(r)
      const size = img?.data ? imageSize(img.data) : undefined
      shot.svg = img?.data && size ? svgImage(img.data, img.mimeType ?? 'image/png', size) : undefined
      if (!shot.svg && path) shot.svg = await thumbnail($, path)
      if (!shot.svg) shot.note = 'no inline preview (image too large)'
    }
  } catch (err) {
    shot = { title: `session ${session}`, note: errText(err) }
  }
  $.ui.invalidate('ui.render')
}

async function thumbnail($: EngineInterface, path: string): Promise<string | undefined> {
  const out = path.replace(/\.(png|jpe?g)$/i, '') + '.qua-ui.jpg'
  try {
    const s = await $.process.run(['sips', '-Z', '720', '-s', 'format', 'jpeg', '-s', 'formatOptions', '45', path, '--out', out])
    if (s.exitCode !== 0) return undefined
    const b = await $.process.run(['base64', '-i', out])
    if (b.exitCode !== 0) return undefined
    const b64 = b.stdout.replace(/\s+/g, '')
    const size = imageSize(b64)
    return size ? svgImage(b64, 'image/jpeg', size) : undefined
  } catch {
    return undefined
  }
}

// qua_shot_get is app-only and hidden from Claude Code; fall back to the step's file.
async function stepShot($: EngineInterface, id: string, step: number, file: string): Promise<void> {
  const title = `${id} step ${step}`
  shot = { title, note: 'loading…' }
  await $.ui.open({ id: SHOT, title: 'Qua shot' })
  try {
    const r = await read($, 'qua_shot_get', { kind: 'run', id, step })
    const img = imageOf(r)
    const size = img?.data ? imageSize(img.data) : undefined
    if (!r.isError && img?.data && size) {
      const path = (structuredOf(r) as { path?: string } | undefined)?.path
      shot = { title, path, png: path?.toLowerCase().endsWith('.png') ? path : undefined, svg: svgImage(img.data, img.mimeType ?? 'image/jpeg', size) }
      $.ui.invalidate('ui.render')
      return
    }
  } catch {
    // Expected in Claude Code: the tool is not listed there.
  }
  const path = file.startsWith('/') ? file : `${await $.session.cwd()}/${file}`
  shot = { title, path, png: path.toLowerCase().endsWith('.png') ? path : undefined }
  shot.svg = await thumbnail($, path)
  if (!shot.svg) shot.note = 'no inline preview'
  $.ui.invalidate('ui.render')
}

async function showLogs($: EngineInterface, session: string): Promise<void> {
  try {
    const r = await read($, 'qua_session_logs', { session, tail: 30 })
    logs = { session, text: textOf(r) || '(no logs)' }
  } catch (err) {
    logs = { session, text: errText(err) }
  }
  $.ui.invalidate('ui.render')
}

async function loadProject($: EngineInterface): Promise<void> {
  try {
    const r = await read($, 'qua_project_get')
    view = toProjectView(structuredOf(r))
    draft = view ? toDraft(view.project) : undefined
    configNote = r.isError ? textOf(r) : view ? '' : 'qua_project_get returned no project'
  } catch (err) {
    configNote = errText(err)
  }
  $.ui.invalidate('ui.render')
}

async function saveProject($: EngineInterface): Promise<void> {
  if (!view || !draft) return
  const { args, changed } = diffProject(view.project, draft)
  if (!changed.length) return
  configNote = 'saving…'
  $.ui.invalidate('ui.render')
  try {
    const r = await call($, WRITE, args)
    if (r.isError) {
      configNote = 'not saved: ' + textOf(r)
    } else {
      view = toProjectView(structuredOf(r)) ?? view
      draft = toDraft(view.project)
      configNote = `saved: ${changed.join(', ')}`
      $.ui.toast('Qua project saved')
    }
  } catch (err) {
    configNote = 'not saved: ' + errText(err)
  }
  $.ui.invalidate('ui.render')
}

async function openPanes($: EngineInterface, which: string): Promise<string> {
  switch (which) {
    case 'config':
      await $.ui.open({ id: CONFIG, title: 'Qua config', focus: true })
      await loadProject($)
      return ''
    case 'shot':
      await $.ui.open({ id: SHOT, title: 'Qua shot' })
      return ''
    case 'run':
      await $.ui.open({ id: RUN, title: 'Qua run' })
      await refreshRuns($)
      return ''
    case 'close':
      for (const id of PANES) await $.ui.close({ id })
      return ''
    case 'probe':
      return probe($)
    default:
      await $.ui.open({ id: SESSIONS, title: 'Qua sessions' })
      await $.ui.open({ id: RUN, title: 'Qua run' })
      await refreshSessions($)
      await refreshRuns($)
      return ''
  }
}

// Read-only self-check of the PoC assumptions.
async function probe($: EngineInterface): Promise<string> {
  const lines: string[] = []
  const v = await $.session.version()
  lines.push(`claude ${v.version}`)
  for (const tool of ['qua_project_get', 'qua_session_list', 'qua_run_list']) {
    try {
      const r = await read($, tool)
      lines.push(`${tool} via ${server}: isError=${Boolean(r.isError)} structured=${r.structuredContent !== undefined} shape=${shapeOf(r)} text=${JSON.stringify(textOf(r).slice(0, 160))}`)
    } catch (err) {
      lines.push(`${tool}: ${errText(err)}`)
    }
  }
  try {
    const r = await read($, 'qua_shot_get', { kind: 'run', id: 'none/none/none' })
    lines.push(`qua_shot_get (app-only) reachable: isError=${Boolean(r.isError)} ${textOf(r).slice(0, 80)}`)
  } catch (err) {
    lines.push(`qua_shot_get: ${errText(err)}`)
  }
  lines.push(`last qua tool.call result shape: ${lastShape || '(none yet)'}`)
  return lines.join('\n')
}

function rowOf(s: Session, now: number): string {
  const when = age(s.finished_at || s.last_used_at, now)
  return [s.name, s.browser, s.kind, s.result, when].filter(Boolean).join('  ')
}

export const register: Register = on => {
  registerGuard(on)
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'qua-ui',
      description: 'Qua panes: sessions, run steps, shot, config',
      argumentHint: '[sessions|run|shot|config|close|probe]',
      immediate: true,
    })
    await $.command.register({ name: 'qua-config', description: 'Edit the Qua project config in a pane', immediate: true })
    await startGuard($)
    $.clock.every(POLL_MS, async () => {
      const open = await $.ui.panes()
      if (autoPoll && open.some(p => p.id === SESSIONS)) await refreshSessions($)
    })
    return next(e)
  })

  on('command.run', { command: 'qua-ui' }, async ($, e) => {
    const text = await openPanes($, (e.args ?? '').trim())
    return text ? { text } : {}
  })

  on('command.run', { command: 'qua-config' }, async $ => {
    await openPanes($, 'config')
    return {}
  })

  on('tool.call', { tool: QUA_ACT }, async ($, e, next) => {
    const kind = /explore$/.test(e.tool) ? 'explore' : /do$/.test(e.tool) ? 'do' : 'run'
    const input = e as unknown as Record<string, unknown>
    const label = kind === 'do' ? String(input.action ?? '') : [input.suite, input.case].filter(Boolean).join('/') || String(input.session ?? '')
    active = { id: String(e.tool_use_id ?? ''), kind, label, startedAt: await $.clock.now(), suite: typeof input.suite === 'string' ? input.suite : undefined }
    $.ui.invalidate('ui.render')
    if (kind === 'run') {
      liveTimer?.cancel()
      liveTimer = $.clock.every(LIVE_MS, () => pollLive($))
    }
    try {
      const res = await next(e)
      lastShape = shapeOf(res)
      const got = stepsOfResult(structuredOf(res))
      if (kind === 'do' && got) {
        const at = await $.clock.now()
        doSteps = [...doSteps, ...got.steps.map(s => ({ ...s, at }))].slice(-20)
      }
      return res
    } finally {
      liveTimer?.cancel()
      liveTimer = undefined
      active = undefined
      if (kind === 'run') await refreshRuns($)
      $.ui.invalidate('ui.render')
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!active) return next(e)
    const done = run?.live ? `${run.passed}/${run.steps_list.length}` : ''
    return next({ ...e, props: { ...e.props, suffix: ` · qua ${active.kind} ${done}`.trimEnd() } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!active || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const steps = active.kind === 'run' && run?.live ? run.steps_list : []
    const marks = steps.map(s => glyph(s.status))
    const theirs = await next(e)
    const mine = (
      <Box flexDirection="row" columnGap={1}>
        <Text color="cyan">qua {active.kind}</Text>
        <Text wrap="truncate-end">{active.label}</Text>
        {marks.map((m, i) => (
          <Text key={`m${i}`} color={m.color}>
            {m.mark}
          </Text>
        ))}
        {steps.length > 0 && <Text dimColor>{`${steps.filter(s => s.status === 'passed').length}/${steps.length}`}</Text>}
        <Text dimColor>{seconds(now - active.startedAt)}</Text>
        <Button key="band-run" label="Steps" plain onPress={() => openPanes($, 'run')} />
      </Box>
    )
    return theirs ? (
      <Box flexDirection="column">
        {mine}
        {theirs}
      </Box>
    ) : (
      mine
    )
  })

  on('ui.render', { component: 'Pane', requestId: SESSIONS }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const now = await $.clock.now()
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text bold>Qua sessions</Text>
          <Text dimColor>{server ? `via ${server}` : ''}</Text>
          <Button key="sessions-refresh" label="Refresh" plain onPress={() => refreshSessions($)} />
        </Box>
        {sessionsError !== '' && <Text color="red">{sessionsError}</Text>}
        {sessions.length === 0 && sessionsError === '' && <Text dimColor>No Qua sessions. Ask the agent to open one.</Text>}
        {sessions.map(s => (
          <Box key={`s-${s.name}`} flexDirection="column">
            <Text wrap="truncate-end" color={s.finished_at ? undefined : 'green'}>
              {rowOf(s, now)}
            </Text>
            <Box flexDirection="row" columnGap={2}>
              <Button key={`shot-${s.name}`} label="Shot" onPress={() => takeShot($, s.name)} />
              <Button key={`logs-${s.name}`} label="Logs" onPress={() => showLogs($, s.name)} />
              <Button
                key={`close-${s.name}`}
                label="Close…"
                onPress={() => $.prompt.fill({ text: `Close the Qua session "${s.name}" (qua_session_close).`, mode: 'replace' })}
              />
            </Box>
          </Box>
        ))}
        {logs && (
          <Box flexDirection="column">
            <Text dimColor>{`logs: ${logs.session}`}</Text>
            <Code source={logs.text} language="text" />
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: RUN }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const r = run
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text bold>Qua run</Text>
          {active && <Text color="cyan">{`running: ${active.kind} ${active.label}`}</Text>}
          <Button key="run-refresh" label="Refresh" plain onPress={() => refreshRuns($)} />
        </Box>
        {runError !== '' && <Text color="red">{runError}</Text>}
        {r ? (
          <Box flexDirection="column">
            <Text wrap="truncate-end">
              <Text color={glyph(r.status).color}>{`${glyph(r.live ? 'running' : r.status).mark} ${r.suite}/${r.case}`}</Text>
              <Text dimColor>{`  ${r.live ? 'live' : r.status}  ${seconds(r.duration_ms)}`}</Text>
            </Text>
            {r.error && <Text color="red">{r.error}</Text>}
            {r.steps_list.map((s, i) => (
              <Box key={`step-${i}`} flexDirection="column">
                <Box flexDirection="row" columnGap={1}>
                  <Text color={glyph(s.status).color}>{glyph(s.status).mark}</Text>
                  <Text wrap="wrap">{`${i + 1}. ${s.prose}`}</Text>
                  {s.shot && <Button key={`step-shot-${i}`} label="Shot" plain onPress={() => stepShot($, r.id, i + 1, s.shot ?? '')} />}
                </Box>
                {s.reason && <Text dimColor wrap="wrap">{`   ${s.reason}`}</Text>}
                {(s.sub_steps ?? []).map((sub, j) => (
                  <Text key={`sub-${i}-${j}`} dimColor wrap="truncate-end">{`   ${glyph(sub.status).mark} ${sub.prose}`}</Text>
                ))}
              </Box>
            ))}
          </Box>
        ) : (
          <Text dimColor>No runs yet.</Text>
        )}
        {doSteps.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>Recent qua_do steps</Text>
            {doSteps.slice(-8).map((s, i) => (
              <Text key={`do-${i}`} wrap="truncate-end">
                <Text color={glyph(s.status).color}>{glyph(s.status).mark}</Text>
                {` ${s.prose}${s.reason ? ' — ' + s.reason : ''}`}
              </Text>
            ))}
          </Box>
        )}
        {runs.length > 1 && (
          <Box flexDirection="column">
            <Text dimColor>Recent runs</Text>
            {runs.map(x => (
              <Button key={`run-${x.id}`} label={`${glyph(x.status).mark} ${x.suite}/${x.case}  ${x.passed}/${x.steps}`} plain onPress={() => refreshRuns($, x.id)} />
            ))}
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: SHOT }, async ($, e) => {
    const s = shot
    const head = s ? s.title : 'No shot yet'
    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Box, Text, Svg, Button } = $.ui.resolve(e)
      const width = Math.min(640, Math.max(240, (e.props.bodyColumns ?? 60) * 8))
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{head}</Text>
          {s?.svg ? <Svg source={s.svg} alt={`Qua screenshot: ${head}`} width={width} /> : <Text dimColor>{s?.note ?? 'Press Shot in the sessions or run pane.'}</Text>}
          {s?.path && <Text dimColor wrap="truncate-start">{s.path}</Text>}
          {s?.path && <Button key="shot-open" label="Open" onPress={() => openFile($, s.path ?? '')} />}
        </Box>
      )
    }
    if (e.surface === 'terminal') {
      const { Box, Text, Image, Button } = $.ui.resolve(e)
      const columns = Math.max(20, Math.min(120, (e.props.bodyColumns ?? 60) - 2))
      return (
        <Box flexDirection="column">
          <Text bold>{head}</Text>
          {s?.png ? (
            <Image key="shot-image" source={{ file: s.png, format: 'png' }} columns={columns} rows={Math.round(columns / 3.2)} alt={`screenshot at ${s.png}`} />
          ) : (
            <Text dimColor>{s?.note ?? 'Press Shot in the sessions or run pane.'}</Text>
          )}
          {s?.path && <Text dimColor wrap="truncate-start">{s.path}</Text>}
          {s?.path && <Button key="shot-open" label="Open" onPress={() => openFile($, s.path ?? '')} />}
        </Box>
      )
    }
    const { Text } = $.ui.resolve(e)
    return <Text>{s?.path ?? head}</Text>
  })

  on('ui.render', { component: 'Pane', requestId: CONFIG }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>Edit the Qua config on desktop or in the terminal.</Text>
    }
    const { Box, Text, Button, Input, Select } = $.ui.resolve(e)
    const d = draft
    if (!view || !d) {
      return (
        <Box flexDirection="column">
          <Text bold>Qua config</Text>
          <Text dimColor>{configNote || 'loading…'}</Text>
          <Button key="cfg-reload" label="Reload" onPress={() => loadProject($)} />
        </Box>
      )
    }
    const { changed } = diffProject(view.project, d)
    const edit = (f: (x: Draft) => void) => {
      f(d)
      $.ui.invalidate('ui.render')
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text bold>Qua config</Text>
          <Text dimColor>{view.qua_version}</Text>
        </Box>
        <Input key="cfg-app-url" label="App URL" value={d.app_url} placeholder="https://…" onInput={v => edit(x => (x.app_url = v))} onSubmit={v => edit(x => (x.app_url = v))} />
        <Select
          key="cfg-env"
          label="Qua env"
          value={d.qua_env}
          options={[
            { value: '', label: '(unset)' },
            { value: 'dev', label: 'dev' },
            { value: 'prod', label: 'prod' },
          ]}
          onSelect={v => edit(x => (x.qua_env = v))}
        />
        <Text dimColor>Stages</Text>
        {d.stages.map(([k, v], i) => (
          <Box key={`stage-${i}`} flexDirection="row" columnGap={1}>
            <Input key={`cfg-stage-${i}`} label={k} value={v} onInput={val => edit(x => (x.stages[i] = [k, val]))} onSubmit={val => edit(x => (x.stages[i] = [k, val]))} />
            <Button key={`cfg-stage-rm-${i}`} label="Remove" plain onPress={() => edit(x => x.stages.splice(i, 1))} />
          </Box>
        ))}
        <Input
          key="cfg-stage-new"
          label="Add stage"
          placeholder="name=https://…"
          value=""
          submitLabel="add"
          onSubmit={val =>
            edit(x => {
              const at = val.indexOf('=')
              if (at > 0) x.stages.push([val.slice(0, at).trim(), val.slice(at + 1).trim()])
            })
          }
        />
        <Text dimColor>Integrations</Text>
        {CATEGORIES.map(c => {
          const it = d.integrations[c] ?? { provider: '', status: '', keys: '' }
          return (
            <Box key={`int-${c}`} flexDirection="column">
              <Select
                key={`cfg-int-status-${c}`}
                label={c}
                value={it.status}
                options={[
                  { value: '', label: '(none)' },
                  { value: 'connected', label: 'connected' },
                  { value: 'failed', label: 'failed' },
                  { value: 'missing', label: 'missing' },
                ]}
                onSelect={v => edit(x => (x.integrations[c] = { ...it, status: v }))}
              />
              <Input key={`cfg-int-provider-${c}`} label="  provider" value={it.provider} onInput={v => edit(x => (x.integrations[c] = { ...it, provider: v }))} onSubmit={v => edit(x => (x.integrations[c] = { ...it, provider: v }))} />
              <Input key={`cfg-int-keys-${c}`} label="  keys" placeholder="project=ABC, repo=org/name" value={it.keys} onInput={v => edit(x => (x.integrations[c] = { ...it, keys: v }))} onSubmit={v => edit(x => (x.integrations[c] = { ...it, keys: v }))} />
            </Box>
          )
        })}
        <Input key="cfg-other" label="Other MCPs" placeholder="name, name" value={d.other} onInput={v => edit(x => (x.other = v))} onSubmit={v => edit(x => (x.other = v))} />
        <Text dimColor>Browsers (change through the agent)</Text>
        {view.browsers.map(b => (
          <Text key={`br-${b.agent}`} wrap="truncate-end">
            {`${b.agent}: ${(b.browsers ?? []).map(x => `${x.default ? '*' : ''}${x.type}${x.engine ? '/' + x.engine : ''} ${x.status}`).join(', ') || '(none)'}`}
          </Text>
        ))}
        <Box flexDirection="row" columnGap={2}>
          {changed.length > 0 ? (
            <Button key="cfg-save" label={`Save ${changed.length} change${changed.length > 1 ? 's' : ''}`} variant="primary" onPress={() => saveProject($)} />
          ) : (
            <Text dimColor>No changes</Text>
          )}
          {changed.length > 0 && <Button key="cfg-revert" label="Revert" onPress={() => revert($)} />}
          <Button key="cfg-reload" label="Reload" onPress={() => loadProject($)} />
          <Button
            key="cfg-browser"
            label="Change browser…"
            onPress={() => $.prompt.fill({ text: 'Change the Qua browser for this agent (qua_browser_set).', mode: 'replace' })}
          />
        </Box>
        {changed.length > 0 && <Text dimColor wrap="wrap">{`changed: ${changed.join(', ')}`}</Text>}
        {configNote !== '' && <Text color={configNote.startsWith('not saved') ? 'red' : undefined}>{configNote}</Text>}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === SHOT) shot = undefined
    return next(e)
  }).catch(($, e, next) => next(e))
}

async function openFile($: EngineInterface, path: string): Promise<void> {
  if (!path) return
  try {
    await $.process.run(['open', path])
  } catch (err) {
    $.ui.toast('open failed: ' + errText(err))
  }
}

function revert($: EngineInterface): void {
  if (view) draft = toDraft(view.project)
  $.ui.invalidate('ui.render')
}
