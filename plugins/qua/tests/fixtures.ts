// Result shapes as qua mcp (v1.4.0-rc.5 dev) returns them.

export const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const result = (structured: unknown, text = 'ok') => ({
  content: [{ type: 'text', text }],
  isError: false,
  structuredContent: structured,
})

export const project = {
  qua_version: 'v1.4.0-rc.5-dev',
  agent: 'claude',
  initialized: true,
  agents: ['claude'],
  configured: true,
  project: {
    app_url: 'http://localhost:5173',
    stages: { dev: 'http://localhost:5173', prod: 'https://shop.example.com' },
    qua_env: 'dev',
    integrations: {
      source_control: { provider: 'github', status: 'connected', keys: { repo: 'acme/shop' } },
    },
    other: [],
  },
  browsers: [{ agent: 'claude', browsers: [{ type: 'playwright', engine: 'chromium', default: true, status: 'running' }], allowed: [], engines: [] }],
}

export const sessions = {
  sessions: [
    { name: 'shop-dev', browser: 'playwright', window: 'w1', last_used_at: '2026-11-09T10:00:00Z', kind: 'do', owner: 'claude' },
    { name: 'smoke-login', browser: 'playwright', finished_at: '2026-11-09T09:00:00Z', result: 'passed', kind: 'run' },
  ],
}

export const runList = {
  source: 'local',
  runs: [
    { id: 'smoke/login/20261109T100000', run_id: 'r1', suite: 'smoke', case: 'login', status: 'failed', started_at: '2026-11-09T10:00:00Z', duration_ms: 12400, steps: 3, passed: 2, log: 'runs/smoke/login/x.log', shots: 1 },
  ],
}

export const runGet = {
  source: 'local',
  id: 'smoke/login/20261109T100000',
  run_id: 'r1',
  suite: 'smoke',
  case: 'login',
  status: 'failed',
  started_at: '2026-11-09T10:00:00Z',
  duration_ms: 12400,
  log: 'runs/smoke/login/x.log',
  live: false,
  shots: ['shots/3.jpg'],
  steps: [
    { prose: 'open the login page', status: 'passed', judgments: [] },
    { prose: 'fill email with a@b.c', status: 'passed', judgments: [], sub_steps: [{ prose: 'focus email', status: 'passed' }] },
    { prose: 'click Sign in', status: 'failed', reason: 'button is disabled', shot: 'shots/3.jpg', judgments: [] },
  ],
}

export const answers: Record<string, unknown> = {
  qua_project_get: result(project),
  qua_session_list: result(sessions),
  qua_run_list: result(runList),
  qua_run_get: result(runGet),
  qua_session_logs: { content: [{ type: 'text', text: 'console: hello' }], isError: false },
  qua_session_screenshot: {
    content: [
      { type: 'text', text: 'path: /tmp/shop-dev.png' },
      { type: 'image', mimeType: 'image/png', data: PNG_1X1 },
    ],
    isError: false,
    structuredContent: { path: '/tmp/shop-dev.png' },
  },
}
