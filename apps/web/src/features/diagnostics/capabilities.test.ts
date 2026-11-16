import { detectCapabilities, formatReport, type DiagnosticsEnv } from './capabilities.ts'

function fakeEnv(opts: {
  push?: boolean
  notification?: NotificationPermission | null
  standalone?: boolean
  secure?: boolean
}): DiagnosticsEnv {
  const win: Record<string, unknown> = {
    isSecureContext: opts.secure ?? true,
    matchMedia: () => ({ matches: false }),
    ServiceWorkerRegistration: { prototype: { showNotification() {} } },
  }
  if (opts.push) win.PushManager = function PushManager() {}
  if (opts.notification) win.Notification = { permission: opts.notification }
  const nav = { userAgent: 'TestAgent/1.0', standalone: opts.standalone, serviceWorker: {} }
  return {
    window: win as unknown as DiagnosticsEnv['window'],
    navigator: nav as unknown as Navigator,
  }
}

const byId = (env: DiagnosticsEnv) =>
  Object.fromEntries(detectCapabilities(env).map((c) => [c.id, c] as const))

test('reports a Fire-like browser without push as missing PushManager', () => {
  const checks = byId(fakeEnv({ push: false, notification: 'default' }))
  expect(checks.push).toMatchObject({ value: 'no', status: 'no' })
  expect(checks.notification).toMatchObject({ value: 'yes', status: 'yes' })
  expect(checks.permission).toMatchObject({ value: 'default', status: 'info' })
  expect(checks.sw).toMatchObject({ status: 'yes' })
})

test('reports an iPhone Home Screen app with permission granted', () => {
  const checks = byId(fakeEnv({ push: true, notification: 'granted', standalone: true }))
  expect(checks.standalone).toMatchObject({ value: 'yes' })
  expect(checks.push).toMatchObject({ value: 'yes' })
  expect(checks.permission).toMatchObject({ value: 'granted', status: 'yes' })
})

test('marks the notification permission unavailable when the API is missing', () => {
  expect(byId(fakeEnv({ notification: null })).permission).toMatchObject({ value: 'unavailable' })
})

test('formats a copyable report with the log', () => {
  const report = formatReport(detectCapabilities(fakeEnv({ push: true })), ['[1] ✓ ok'])
  expect(report).toContain('Push API (PushManager): yes')
  expect(report).toContain('User agent: TestAgent/1.0')
  expect(report).toContain('[1] ✓ ok')
})

test('says when no tests were run', () => {
  expect(formatReport([], [])).toContain('(no tests run)')
})
