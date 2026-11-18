// Web push on this device (SPEC-NT-001 device_notifications). Pure browser logic: it never talks to the
// API (the caller passes `save` and `remove`) and never hard-codes the VAPID key (NC-NT-NO-HARDCODED-VAPID).
//
//   UNSUPPORTED        no Push API here
//   NEEDS_HOME_SCREEN  iOS only allows push from the Home Screen app, so a plain Safari tab never gets ON
//   NOT_CONFIGURED     this build has no VITE_VAPID_PUBLIC_KEY
//   OFF / PERMISSION_DENIED / ON
//   KEY_MISMATCH       the browser's subscription was made with another VAPID key (the D17 root cause):
//                      it is replaced, never kept
export type PushEnv = { window: Window & typeof globalThis; navigator: Navigator }

export type PushSupport = 'UNSUPPORTED' | 'NEEDS_HOME_SCREEN' | 'SUPPORTED'

export type DeviceState =
  | { state: 'ON'; endpoint: string }
  | {
      state:
        | 'OFF'
        | 'UNSUPPORTED'
        | 'NEEDS_HOME_SCREEN'
        | 'NOT_CONFIGURED'
        | 'UNKNOWN'
        | 'PERMISSION_DENIED'
        | 'KEY_MISMATCH'
    }

export const defaultPushEnv = (): PushEnv => ({ window, navigator })

const isIos = ({ navigator }: PushEnv): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

function isStandalone({ window, navigator }: PushEnv): boolean {
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return (
    ios ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  )
}

export function detectPushSupport(env: PushEnv): PushSupport {
  if (isIos(env) && !isStandalone(env)) return 'NEEDS_HOME_SCREEN'
  const ok =
    'PushManager' in env.window && 'Notification' in env.window && 'serviceWorker' in env.navigator
  return ok ? 'SUPPORTED' : 'UNSUPPORTED'
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Scope of the push worker: it must not replace the app's own worker at / (see public/sw-push.js). */
export const PUSH_WORKER_URL = '/sw-push.js'
export const PUSH_WORKER_SCOPE = '/sw-push/'

async function registration(env: PushEnv): Promise<ServiceWorkerRegistration> {
  const reg = await env.navigator.serviceWorker.register(PUSH_WORKER_URL, {
    scope: PUSH_WORKER_SCOPE,
  })
  await activated(reg)
  return reg
}

/** Resolves once this registration's own worker is active (`serviceWorker.ready` follows the app's worker at /, not this one). */
function activated(reg: ServiceWorkerRegistration): Promise<void> {
  const worker = reg.installing ?? reg.waiting ?? reg.active
  if (!worker || worker.state === 'activated') return Promise.resolve()
  return new Promise((resolve, reject) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve()
      else if (worker.state === 'redundant')
        reject(new Error('The notification worker could not start.'))
    })
  })
}

function sameKey(subscription: PushSubscription, vapidKey: string): boolean {
  const have = subscription.options?.applicationServerKey
  if (!have) return false
  const a = new Uint8Array(have)
  const b = base64UrlToBytes(vapidKey)
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

async function currentSubscription(env: PushEnv): Promise<PushSubscription | null> {
  const { serviceWorker } = env.navigator
  const found = serviceWorker.getRegistration
    ? await serviceWorker.getRegistration(PUSH_WORKER_SCOPE)
    : await registration(env)
  return (await found?.pushManager.getSubscription()) ?? null
}

export async function readDeviceState(env: PushEnv, vapidKey: string): Promise<DeviceState> {
  const support = detectPushSupport(env)
  if (support !== 'SUPPORTED') return { state: support }
  if (!vapidKey) return { state: 'NOT_CONFIGURED' }
  if (env.window.Notification.permission === 'denied') return { state: 'PERMISSION_DENIED' }
  const subscription = await currentSubscription(env)
  if (!subscription) return { state: 'OFF' }
  return sameKey(subscription, vapidKey)
    ? { state: 'ON', endpoint: subscription.endpoint }
    : { state: 'KEY_MISMATCH' }
}

/**
 * Turns notifications on for this device: permission, worker, a subscription with the configured key, and
 * `save`. A stale subscription is replaced. If `save` fails the browser subscription is dropped again and
 * the error is thrown, so the browser never says "on" for a device the server does not know.
 */
export async function enableDevice(
  env: PushEnv,
  vapidKey: string,
  save: (subscription: PushSubscriptionJSON) => Promise<void>,
): Promise<DeviceState> {
  const support = detectPushSupport(env)
  if (support !== 'SUPPORTED') return { state: support }
  if (!vapidKey) return { state: 'NOT_CONFIGURED' }
  const permission =
    env.window.Notification.permission === 'granted'
      ? 'granted'
      : await env.window.Notification.requestPermission()
  if (permission !== 'granted') return { state: 'PERMISSION_DENIED' }

  const reg = await registration(env)
  const existing = await reg.pushManager.getSubscription()
  if (existing && !sameKey(existing, vapidKey)) await existing.unsubscribe()
  const kept = existing && sameKey(existing, vapidKey) ? existing : null
  const subscription =
    kept ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(vapidKey),
    }))
  try {
    await save(subscription.toJSON())
  } catch (error) {
    await subscription.unsubscribe().catch(() => undefined)
    throw error
  }
  return { state: 'ON', endpoint: subscription.endpoint }
}

/** Turns notifications off for this device only: the server forgets it first, then the browser unsubscribes. */
export async function disableDevice(
  env: PushEnv,
  remove: (endpoint: string) => Promise<void>,
): Promise<void> {
  const subscription = await currentSubscription(env)
  if (!subscription) return
  await remove(subscription.endpoint)
  // The server has forgotten this device, so nothing will be pushed to it; a browser that refuses to
  // unsubscribe only leaves an unused subscription behind.
  await subscription.unsubscribe().catch(() => undefined)
}
