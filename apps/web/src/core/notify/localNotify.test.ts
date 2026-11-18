// SPEC-NT-001 on the Fire shell: reminders are scheduled ON the device (F-NT-01, outcome B), the device registers
// as a local channel so the server never pushes to it (NC-NT-NO-DUPLICATES), and the status says what is true (F-NT-04).
import { describe, expect, it, vi } from 'vitest'
import {
  disableLocal,
  enableLocal,
  forgetLocal,
  clearLowStockSeen,
  isNativeShell,
  isRegistered,
  localDeviceId,
  readLocalState,
  notifyLowStock,
  sendLocalTest,
  syncLocalReminders,
  type LocalPlugin,
} from './localNotify'

type Scheduled = {
  id: number
  title: string
  body: string
  schedule?: { at: Date }
  extra?: unknown
}
function fakePlugin(
  over: { permission?: 'granted' | 'denied' | 'prompt'; pending?: Array<{ id: number }> } = {},
) {
  let permission = over.permission ?? 'prompt'
  let pending = over.pending ?? []
  const plugin = {
    checkPermissions: vi.fn(async () => ({ display: permission })),
    requestPermissions: vi.fn(async () => {
      if (permission === 'prompt') permission = 'granted'
      return { display: permission }
    }),
    getPending: vi.fn(async () => ({ notifications: pending })),
    cancel: vi.fn(async () => {
      pending = []
    }),
    schedule: vi.fn(async ({ notifications }: { notifications: Scheduled[] }) => {
      const ids = new Set(notifications.map((n) => n.id))
      // Like the real plugin: a reminder with the same id replaces the old one; others stay pending.
      pending = [
        ...pending.filter((p) => !ids.has(p.id)),
        ...notifications.map((n) => ({ id: n.id })),
      ]

      return { notifications: [] }
    }),
    createChannel: vi.fn(async () => undefined),
  }
  return plugin as typeof plugin & LocalPlugin
}
const prefs = { timezone: 'America/Toronto', notifyHour: 9, expiryAlerts: true }
const NOW = new Date('2026-11-18T05:30:00Z')
const milk = {
  id: 1,
  name: 'Milk',
  expirationDate: '2026-11-20',
  notificationEnabled: true,
  notificationDaysBefore: 3,
}

describe('isNativeShell', () => {
  it('is false in a browser and true inside the Capacitor shell', () => {
    expect(isNativeShell({} as Window)).toBe(false)
    expect(
      isNativeShell({ Capacitor: { isNativePlatform: () => true } } as unknown as Window),
    ).toBe(true)
  })
})

describe('localDeviceId', () => {
  it('is a uuid, made once and kept', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage
    const first = localDeviceId(storage)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(localDeviceId(storage)).toBe(first)
  })
})

const memory = () => {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage
}

describe('readLocalState', () => {
  it('OFF before permission is asked, PERMISSION_DENIED when blocked, ON when allowed and registered', async () => {
    expect((await readLocalState(fakePlugin(), 'dev', true)).state).toBe('OFF')
    expect(
      (await readLocalState(fakePlugin({ permission: 'denied' }), 'dev', true).then((s) => s))
        .state,
    ).toBe('PERMISSION_DENIED')
    expect(await readLocalState(fakePlugin({ permission: 'granted' }), 'dev', true)).toEqual({
      state: 'ON',
      endpoint: 'local:dev',
    })
    // Allowed but this device never registered (e.g. after signing out): still off.
    expect((await readLocalState(fakePlugin({ permission: 'granted' }), 'dev', false)).state).toBe(
      'OFF',
    )
  })
})

describe('registration is per user', () => {
  it('another account signing in on the same tablet does not inherit the reminders', async () => {
    const storage = memory()
    await enableLocal(fakePlugin(), 'dev', vi.fn().mockResolvedValue(undefined), storage, 'u1')
    expect(isRegistered(storage, 'u1')).toBe(true)
    expect(isRegistered(storage, 'u2')).toBe(false)
  })
  it('forgetLocal (sign out anyway) cancels the reminders and forgets, without the server', async () => {
    const storage = memory()
    const plugin = fakePlugin({ permission: 'granted', pending: [{ id: 20261118 }, { id: 1 }] })
    await enableLocal(plugin, 'dev', vi.fn().mockResolvedValue(undefined), storage, 'u1')
    await forgetLocal(plugin, storage)
    expect(isRegistered(storage, 'u1')).toBe(false)
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 20261118 }] })
  })
})

describe('enableLocal / disableLocal', () => {
  it('OFF -> ON: asks permission, registers the local device, answers ON with its endpoint', async () => {
    const plugin = fakePlugin()
    const save = vi.fn().mockResolvedValue(undefined)
    expect(await enableLocal(plugin, 'dev', save, memory(), 'u1')).toEqual({
      state: 'ON',
      endpoint: 'local:dev',
    })
    expect(save).toHaveBeenCalledWith({ channel: 'local', deviceId: 'dev' })
  })
  it('OFF -> PERMISSION_DENIED: registers nothing', async () => {
    const save = vi.fn()
    expect(
      (await enableLocal(fakePlugin({ permission: 'denied' }), 'dev', save, memory(), 'u1')).state,
    ).toBe('PERMISSION_DENIED')
    expect(save).not.toHaveBeenCalled()
  })
  it('NC-NT-NO-SILENT-FAILURE: a failed registration cancels nothing it scheduled and throws', async () => {
    const plugin = fakePlugin()
    await expect(
      enableLocal(plugin, 'dev', vi.fn().mockRejectedValue(new Error('offline')), memory(), 'u1'),
    ).rejects.toThrow('offline')
  })
  it('ON -> OFF: removes the device on the server and cancels every scheduled reminder', async () => {
    const plugin = fakePlugin({ permission: 'granted', pending: [{ id: 20261118 }] })
    const remove = vi.fn().mockResolvedValue(undefined)
    await disableLocal(plugin, 'dev', remove, memory())
    expect(remove).toHaveBeenCalledWith('local:dev')
    expect(plugin.cancel).toHaveBeenCalled()
  })
  it('a failed server removal keeps the schedule (the device is still registered) and throws', async () => {
    const plugin = fakePlugin({ permission: 'granted', pending: [{ id: 1 }] })
    await expect(
      disableLocal(plugin, 'dev', vi.fn().mockRejectedValue(new Error('offline')), memory()),
    ).rejects.toThrow('offline')
    expect(plugin.cancel).not.toHaveBeenCalled()
  })
})

describe('syncLocalReminders', () => {
  it('F-NT-01: replaces the old schedule with one reminder per day, at her hour, opening the expiring list', async () => {
    const plugin = fakePlugin({ permission: 'granted', pending: [{ id: 5 }, { id: 20261101 }] })
    const result = await syncLocalReminders(plugin, [milk], prefs, NOW)
    // 5 is not a date id (a pending test notification): only the stale date reminder is cancelled, below.
    const call = plugin.schedule.mock.calls[0]![0].notifications
    expect(call.map((n: Scheduled) => n.title)).toEqual([
      'Item expiring soon',
      'Item expiring soon',
      'Item expiring soon',
    ])
    expect(call[0]!.schedule?.at.toISOString()).toBe('2026-11-18T14:00:00.000Z')
    expect(call[0]!.extra).toMatchObject({ url: '/stock?status=expiring' })
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 20261101 }] })
    expect(result).toEqual({ scheduled: 3 })
  })
  it('NC-NT-NO-SILENT-FAILURE: a schedule that fails leaves the old reminders in place and throws', async () => {
    const plugin = fakePlugin({ permission: 'granted', pending: [{ id: 20261101 }] })
    plugin.schedule.mockRejectedValue(new Error('exact alarms refused'))
    await expect(syncLocalReminders(plugin, [milk], prefs, NOW)).rejects.toThrow(
      'exact alarms refused',
    )
    expect(plugin.cancel).not.toHaveBeenCalled()
  })
  it('schedules nothing without permission and says so', async () => {
    const plugin = fakePlugin({ permission: 'denied' })
    expect(await syncLocalReminders(plugin, [milk], prefs, NOW)).toEqual({
      scheduled: 0,
      reason: 'PERMISSION_DENIED',
    })
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
  it('with nothing to remind about it still clears what was scheduled before', async () => {
    const plugin = fakePlugin({ permission: 'granted', pending: [{ id: 20261101 }] })
    expect(await syncLocalReminders(plugin, [], prefs, NOW)).toEqual({ scheduled: 0 })
    expect(plugin.cancel).toHaveBeenCalled()
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
})

describe('sendLocalTest', () => {
  it('F-NT-04: shows a test notification on this device in a moment', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    await sendLocalTest(plugin, NOW)
    const [n] = plugin.schedule.mock.calls[0]![0].notifications as Scheduled[]
    expect(n!.title).toBe('Test from Chắt Chiu')
    expect(n!.schedule!.at.getTime()).toBeGreaterThan(NOW.getTime())
  })
})

describe('notifyLowStock', () => {
  const memory = () => {
    const store = new Map<string, string>()
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage
  }
  it('F-NT-03: "Butter is running low (15%)" shows at once on this device, once, and not again until Butter is restocked', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const storage = memory()
    storage.setItem('chatchiu.local-registered', 'u1')
    expect(
      await notifyLowStock(plugin, { itemId: 7, name: 'Butter', percent: 15 }, NOW, storage),
    ).toBe(true)
    const [n] = plugin.schedule.mock.calls[0]![0].notifications as Scheduled[]
    expect(n!.title).toBe('Running low')
    expect(n!.body).toBe('Butter is running low (15%)')
    expect(
      await notifyLowStock(plugin, { itemId: 7, name: 'Butter', percent: 12 }, NOW, storage),
    ).toBe(false)
    expect(plugin.schedule).toHaveBeenCalledTimes(1)
    clearLowStockSeen(7, storage)
    expect(
      await notifyLowStock(plugin, { itemId: 7, name: 'Butter', percent: 10 }, NOW, storage),
    ).toBe(true)
  })
  it('shows nothing on a tablet reminders were never turned on for (or turned off), even with permission', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const storage = memory()
    expect(
      await notifyLowStock(plugin, { itemId: 7, name: 'Butter', percent: 15 }, NOW, storage),
    ).toBe(false)
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
  it('shows nothing on a tablet reminders were never turned on for (or turned off), even with permission', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    expect(
      await notifyLowStock(plugin, { itemId: 7, name: 'Butter', percent: 15 }, NOW, memory()),
    ).toBe(false)
    expect(plugin.schedule).not.toHaveBeenCalled()
  })
  it('shows nothing without permission (and does not remember it as shown)', async () => {
    const plugin = fakePlugin({ permission: 'denied' })
    const storage = memory()
    storage.setItem('chatchiu.local-registered', 'u1')
    expect(
      await notifyLowStock(plugin, { itemId: 7, name: 'Butter', percent: 15 }, NOW, storage),
    ).toBe(false)
    expect(plugin.schedule).not.toHaveBeenCalled()
    expect(storage.getItem('chatchiu.low-stock-seen')).toBeNull()
  })
})
