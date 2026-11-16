// Pure capability detection for the Phase 0 notification spike (roadmap 0.6).

export type CheckStatus = 'yes' | 'no' | 'info'

export interface CapabilityCheck {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly status: CheckStatus
}

export interface DiagnosticsEnv {
  readonly window: Window & typeof globalThis
  readonly navigator: Navigator
}

const flag = (id: string, label: string, ok: boolean): CapabilityCheck => ({
  id,
  label,
  value: ok ? 'yes' : 'no',
  status: ok ? 'yes' : 'no',
})

function isStandalone({ window, navigator }: DiagnosticsEnv): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  return iosStandalone || displayStandalone
}

export function detectCapabilities(env: DiagnosticsEnv): CapabilityCheck[] {
  const { window, navigator } = env
  const hasNotification = 'Notification' in window
  const swRegProto = (window as { ServiceWorkerRegistration?: { prototype: object } })
    .ServiceWorkerRegistration?.prototype

  return [
    { id: 'ua', label: 'User agent', value: navigator.userAgent, status: 'info' },
    flag('secure', 'Secure context (HTTPS)', window.isSecureContext === true),
    flag('standalone', 'Opened as installed app (Home Screen)', isStandalone(env)),
    flag('sw', 'Service worker API', 'serviceWorker' in navigator),
    flag('push', 'Push API (PushManager)', 'PushManager' in window),
    flag('notification', 'Notification API', hasNotification),
    {
      id: 'permission',
      label: 'Notification permission',
      value: hasNotification ? window.Notification.permission : 'unavailable',
      status: hasNotification && window.Notification.permission === 'granted' ? 'yes' : 'info',
    },
    flag(
      'showNotification',
      'Service worker showNotification',
      !!swRegProto && 'showNotification' in swRegProto,
    ),
    flag('periodicSync', 'Periodic background sync', !!swRegProto && 'periodicSync' in swRegProto),
    flag('badge', 'App badge (setAppBadge)', 'setAppBadge' in navigator),
  ]
}

export function formatReport(checks: readonly CapabilityCheck[], log: readonly string[]): string {
  const lines = checks.map((c) => `${c.label}: ${c.value}`)
  return [
    `Chắt Chiu diagnostics — ${new Date().toISOString()}`,
    ...lines,
    '',
    'Test log:',
    ...(log.length ? log : ['(no tests run)']),
  ].join('\n')
}
