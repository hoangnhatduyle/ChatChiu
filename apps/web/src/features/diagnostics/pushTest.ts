// Subscribe -> send -> receive test against the dev-only /api/diagnostics function.

const SW_URL = '/sw-diagnostics.js'
const DIAGNOSTICS_API = '/api/diagnostics'

export type Log = (line: string) => void

interface PushResult {
  readonly host: string
  readonly pushServiceStatus: number | null
  readonly pushServiceError?: string
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const describeError = (err: unknown): string =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err)

export async function registerWorker(log: Log): Promise<ServiceWorkerRegistration | null> {
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    const reg = await navigator.serviceWorker.ready
    log(`Service worker active (scope ${reg.scope})`)
    return reg
  } catch (err) {
    log(`✗ Service worker registration failed: ${describeError(err)}`)
    return null
  }
}

export async function requestPermission(log: Log): Promise<boolean> {
  if (!('Notification' in window)) {
    log('✗ Notification API not available')
    return false
  }
  const result = await Notification.requestPermission()
  log(`Notification permission: ${result}`)
  return result === 'granted'
}

export async function showLocalNotification(log: Log): Promise<void> {
  const reg = await registerWorker(log)
  if (!reg || !(await requestPermission(log))) return
  try {
    await reg.showNotification('Chắt Chiu diagnostics', {
      body: 'Local notification (no server involved).',
      tag: 'diagnostics-local',
    })
    log('✓ Local notification requested; did a banner appear?')
  } catch (err) {
    log(`✗ showNotification failed: ${describeError(err)}`)
  }
}

async function subscribe(
  reg: ServiceWorkerRegistration,
  log: Log,
): Promise<PushSubscription | null> {
  const keyRes = await fetch(DIAGNOSTICS_API)
  if (!keyRes.ok) {
    log(`✗ Diagnostics API unavailable (HTTP ${keyRes.status})`)
    return null
  }
  const { data } = (await keyRes.json()) as { data: { publicKey: string } }
  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(data.publicKey),
    })
    log(`✓ Subscribed via ${new URL(sub.endpoint).hostname}`)
    return sub
  } catch (err) {
    log(`✗ pushManager.subscribe failed: ${describeError(err)}`)
    return null
  }
}

export async function runPushTest(delaySeconds: number, log: Log): Promise<void> {
  if (!('PushManager' in window)) {
    log('✗ Push API not available in this browser/mode')
    return
  }
  const reg = await registerWorker(log)
  if (!reg || !(await requestPermission(log))) return
  const sub = await subscribe(reg, log)
  if (!sub) return

  log(
    delaySeconds > 0
      ? `Server will push in ${delaySeconds}s; close or lock the app now.`
      : 'Sending push…',
  )
  try {
    const res = await fetch(DIAGNOSTICS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), delaySeconds }),
      keepalive: delaySeconds === 0,
    })
    const body = (await res.json()) as { data?: PushResult; error?: { message: string } }
    if (!res.ok || !body.data) {
      log(`✗ Server: ${body.error?.message ?? `HTTP ${res.status}`}`)
      return
    }
    const { host, pushServiceStatus, pushServiceError } = body.data
    log(
      pushServiceError
        ? `✗ Push service ${host} rejected it (${pushServiceStatus ?? 'no status'}): ${pushServiceError}`
        : `✓ Push service ${host} accepted it (HTTP ${pushServiceStatus}). Did the notification arrive?`,
    )
  } catch (err) {
    log(`✗ Send request failed: ${describeError(err)}`)
  }
}
