// SPEC-NT-001 device_notifications state machine and its negative constraints.
import { describe, expect, it, vi } from 'vitest'
import {
  detectPushSupport,
  disableDevice,
  enableDevice,
  readDeviceState,
  type PushEnv,
} from './webPush'

const KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const OTHER_KEY =
  'BPe62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

function bytesOf(key: string): ArrayBuffer {
  const padded = key + '='.repeat((4 - (key.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

type Options = {
  ua?: string
  standalone?: boolean
  push?: boolean
  permission?: NotificationPermission
  existing?: { endpoint: string; key: string } | null
}

function makeEnv(o: Options = {}) {
  const { existing = null } = o
  let current: unknown = existing && {
    endpoint: existing.endpoint,
    options: { applicationServerKey: bytesOf(existing.key) },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint: existing.endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  }
  const subscribe = vi.fn(async () => {
    current = {
      endpoint: 'https://web.push.apple.com/new',
      options: { applicationServerKey: bytesOf(KEY) },
      unsubscribe: vi.fn().mockResolvedValue(true),
      toJSON: () => ({
        endpoint: 'https://web.push.apple.com/new',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    }
    return current
  })
  const registration = {
    pushManager: { getSubscription: vi.fn(async () => current), subscribe },
  }
  const requestPermission = vi.fn(async () => o.permission ?? 'granted')
  const win = {
    isSecureContext: true,
    matchMedia: () => ({ matches: o.standalone ?? false }),
    Notification: Object.assign(function () {}, {
      permission: o.permission ?? 'default',
      requestPermission,
    }),
    ...(o.push === false ? {} : { PushManager: function () {} }),
  }
  const nav = {
    userAgent: o.ua ?? 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120',
    maxTouchPoints: 0,
    serviceWorker: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  }
  const env = { window: win, navigator: nav } as unknown as PushEnv
  return {
    env,
    subscribe,
    requestPermission,
    registration,
    nav,
    get current() {
      return current
    },
  }
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1'

describe('detectPushSupport', () => {
  it('F-NT-04: an iPhone in a plain Safari tab needs the Home Screen app', () => {
    expect(detectPushSupport(makeEnv({ ua: IPHONE, push: false }).env)).toBe('NEEDS_HOME_SCREEN')
  })
  it('F-NT-04: the iPhone Home Screen app supports push', () => {
    expect(detectPushSupport(makeEnv({ ua: IPHONE, standalone: true }).env)).toBe('SUPPORTED')
  })
  it('F-NT-04: a browser with no Push API is unsupported', () => {
    expect(detectPushSupport(makeEnv({ push: false }).env)).toBe('UNSUPPORTED')
  })
})

describe('readDeviceState', () => {
  it('is OFF with no subscription, ON with a matching one', async () => {
    expect((await readDeviceState(makeEnv().env, KEY)).state).toBe('OFF')
    const on = makeEnv({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', key: KEY },
    })
    expect((await readDeviceState(on.env, KEY)).state).toBe('ON')
  })
  it('reports PERMISSION_DENIED when the browser blocked notifications', async () => {
    expect((await readDeviceState(makeEnv({ permission: 'denied' }).env, KEY)).state).toBe(
      'PERMISSION_DENIED',
    )
  })
  it('FORBID KEY_MISMATCH kept: a subscription made with another VAPID key is a mismatch', async () => {
    const stale = makeEnv({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', key: OTHER_KEY },
    })
    expect((await readDeviceState(stale.env, KEY)).state).toBe('KEY_MISMATCH')
  })
  it('NC-NT-NO-HARDCODED-VAPID: without VITE_VAPID_PUBLIC_KEY the state says it is not configured', async () => {
    expect((await readDeviceState(makeEnv().env, '')).state).toBe('NOT_CONFIGURED')
  })
})

describe('enableDevice', () => {
  it('OFF -> ON: asks permission, subscribes with the configured key, saves the subscription', async () => {
    const t = makeEnv()
    const save = vi.fn().mockResolvedValue(undefined)
    const result = await enableDevice(t.env, KEY, save)
    expect(result.state).toBe('ON')
    expect(t.subscribe).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://web.push.apple.com/new' }),
    )
  })
  it('OFF -> PERMISSION_DENIED: nothing is subscribed or saved', async () => {
    const t = makeEnv({ permission: 'denied' })
    const save = vi.fn()
    expect((await enableDevice(t.env, KEY, save)).state).toBe('PERMISSION_DENIED')
    expect(t.subscribe).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
  it('FORBID NEEDS_HOME_SCREEN -> ON: never subscribes in a plain iPhone tab', async () => {
    const t = makeEnv({ ua: IPHONE, push: false })
    const save = vi.fn()
    expect((await enableDevice(t.env, KEY, save)).state).toBe('NEEDS_HOME_SCREEN')
    expect(t.subscribe).not.toHaveBeenCalled()
  })
  it('KEY_MISMATCH -> ON: drops the stale subscription and subscribes again with the right key', async () => {
    const t = makeEnv({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', key: OTHER_KEY },
    })
    const old = t.current as { unsubscribe: ReturnType<typeof vi.fn> }
    const save = vi.fn().mockResolvedValue(undefined)
    expect((await enableDevice(t.env, KEY, save)).state).toBe('ON')
    expect(old.unsubscribe).toHaveBeenCalled()
    expect(t.subscribe).toHaveBeenCalledOnce()
  })
  it('NC-NT-NO-SILENT-FAILURE: a failed save undoes the browser subscription and throws', async () => {
    const t = makeEnv()
    const save = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(enableDevice(t.env, KEY, save)).rejects.toThrow('offline')
    expect((t.current as { unsubscribe: ReturnType<typeof vi.fn> }).unsubscribe).toHaveBeenCalled()
  })
})

describe('enableDevice and the push worker', () => {
  it('waits for the push worker itself to activate before subscribing (not the app worker)', async () => {
    const t = makeEnv()
    let activate: () => void = () => {}
    const worker = {
      state: 'installing',
      addEventListener: (_: string, fn: () => void) => {
        activate = () => {
          worker.state = 'activated'
          fn()
        }
      },
    }
    const reg = (await t.nav.serviceWorker.ready) as unknown as { installing?: unknown }
    reg.installing = worker
    const pending = enableDevice(t.env, KEY, vi.fn().mockResolvedValue(undefined))
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(t.subscribe).not.toHaveBeenCalled()
    activate()
    expect((await pending).state).toBe('ON')
    expect(t.subscribe).toHaveBeenCalledOnce()
  })
})

describe('disableDevice', () => {
  it('ON -> OFF: removes this device on the server, then unsubscribes in the browser', async () => {
    const t = makeEnv({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', key: KEY },
    })
    const sub = t.current as { unsubscribe: ReturnType<typeof vi.fn> }
    const remove = vi.fn().mockResolvedValue(undefined)
    await disableDevice(t.env, remove)
    expect(remove).toHaveBeenCalledWith('https://fcm.googleapis.com/x')
    expect(sub.unsubscribe).toHaveBeenCalled()
  })
  it('a failed server removal keeps the browser subscription and throws', async () => {
    const t = makeEnv({
      permission: 'granted',
      existing: { endpoint: 'https://fcm.googleapis.com/x', key: KEY },
    })
    const sub = t.current as { unsubscribe: ReturnType<typeof vi.fn> }
    await expect(
      disableDevice(t.env, vi.fn().mockRejectedValue(new Error('offline'))),
    ).rejects.toThrow('offline')
    expect(sub.unsubscribe).not.toHaveBeenCalled()
  })
  it('does nothing when this device has no subscription', async () => {
    const remove = vi.fn()
    await disableDevice(makeEnv().env, remove)
    expect(remove).not.toHaveBeenCalled()
  })
})
