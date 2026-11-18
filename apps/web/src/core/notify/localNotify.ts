// Notifications on the Fire tablet shell (architecture.md §6.2, SPEC-NT-001 outcome B): the tablet has no Google
// push, so the app schedules its reminders ON the device with the Capacitor local-notifications plugin. The browser
// side of the same feature is webPush.ts. Pure functions over a plugin interface, so they are tested with a fake;
// `loadLocalPlugin` loads the real plugin only inside the shell. Callers pass the storage (core/ never touches it).
import {
  cleanName,
  lowStockReminder,
  planLocalReminders,
  type ScheduleItem,
  type SchedulePrefs,
} from '@chatchiu/domain'

export interface LocalPlugin {
  checkPermissions(): Promise<{ display: string }>
  requestPermissions(): Promise<{ display: string }>
  getPending(): Promise<{ notifications: Array<{ id: number }> }>
  cancel(options: { notifications: Array<{ id: number }> }): Promise<void>
  schedule(options: {
    notifications: Array<{
      id: number
      title: string
      body: string
      channelId?: string
      schedule?: { at: Date; allowWhileIdle?: boolean }
      extra?: Record<string, string>
    }>
  }): Promise<unknown>
  createChannel?(channel: {
    id: string
    name: string
    importance: 1 | 2 | 3 | 4 | 5
  }): Promise<void>
}

export type LocalState = { state: 'ON'; endpoint: string } | { state: 'OFF' | 'PERMISSION_DENIED' }

/** True inside the Capacitor shell (the Fire app), false in a browser. */
export function isNativeShell(win: Window = window): boolean {
  const capacitor = (win as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor
  return capacitor?.isNativePlatform?.() === true
}

export async function loadLocalPlugin(): Promise<LocalPlugin> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return LocalNotifications as unknown as LocalPlugin
}

/** Tells the reminder sync that this device was turned on or off. */
export const REMINDERS_CHANGED = 'chatchiu:reminders-changed'

const DEVICE_KEY = 'chatchiu.local-device-id'
const REGISTERED_KEY = 'chatchiu.local-registered'
const LOW_SEEN_KEY = 'chatchiu.low-stock-seen'
const CHANNEL_ID = 'reminders'
/** A test or low-stock alert shows about a second after it is asked for (the plugin has no "now"). */
const SOON_MS = 1500

/** This device's id for the server: made once, kept. */
export function localDeviceId(storage: Storage): string {
  const kept = storage.getItem(DEVICE_KEY)
  if (kept) return kept
  const id = crypto.randomUUID()
  storage.setItem(DEVICE_KEY, id)
  return id
}

/**
 * True when THIS user turned reminders on for this device. The flag holds the user id, so another account that signs
 * in on the same tablet does not inherit the schedule.
 */
export const isRegistered = (storage: Storage, userId: string): boolean =>
  storage.getItem(REGISTERED_KEY) === userId
const setRegistered = (userId: string | null, storage: Storage) =>
  userId ? storage.setItem(REGISTERED_KEY, userId) : storage.removeItem(REGISTERED_KEY)

export const localEndpoint = (deviceId: string): string => `local:${deviceId}`

export async function readLocalState(
  plugin: LocalPlugin,
  deviceId: string,
  registered: boolean,
): Promise<LocalState> {
  const { display } = await plugin.checkPermissions()
  if (display === 'denied') return { state: 'PERMISSION_DENIED' }
  return display === 'granted' && registered
    ? { state: 'ON', endpoint: localEndpoint(deviceId) }
    : { state: 'OFF' }
}

/** Asks permission, then registers this device as a local one (the server never pushes to it). */
export async function enableLocal(
  plugin: LocalPlugin,
  deviceId: string,
  save: (body: { channel: 'local'; deviceId: string }) => Promise<void>,
  storage: Storage,
  userId: string,
): Promise<LocalState> {
  const current = await plugin.checkPermissions()
  const display =
    current.display === 'granted' ? 'granted' : (await plugin.requestPermissions()).display
  if (display !== 'granted') return { state: 'PERMISSION_DENIED' }
  await plugin.createChannel?.({ id: CHANNEL_ID, name: 'Reminders', importance: 4 })
  await save({ channel: 'local', deviceId })
  setRegistered(userId, storage)
  return { state: 'ON', endpoint: localEndpoint(deviceId) }
}

/** The expiry reminders are the ones whose id is a date (20261118): a pending test or low-stock alert is left alone. */
const isReminderId = (id: number): boolean => id >= 10_000_101 && id <= 99_991_231

async function cancelReminders(
  plugin: LocalPlugin,
  keep: ReadonlySet<number> = new Set(),
): Promise<void> {
  const { notifications } = await plugin.getPending()
  const stale = notifications.filter((n) => isReminderId(n.id) && !keep.has(n.id))
  if (stale.length > 0) await plugin.cancel({ notifications: stale })
}

/** The server forgets this device first; then every reminder scheduled on it is cancelled. */
export async function disableLocal(
  plugin: LocalPlugin,
  deviceId: string,
  remove: (endpoint: string) => Promise<void>,
  storage: Storage,
): Promise<void> {
  await remove(localEndpoint(deviceId))
  setRegistered(null, storage)
  await cancelReminders(plugin)
}

/** Leaving without the server (sign out anyway): this tablet stops showing reminders and forgets it was on. */
export async function forgetLocal(plugin: LocalPlugin, storage: Storage): Promise<void> {
  setRegistered(null, storage)
  await cancelReminders(plugin)
}

export type SyncResult = { scheduled: number; reason?: 'PERMISSION_DENIED' }

/**
 * Rebuilds the schedule: one grouped expiry reminder per local day, at her hour (planLocalReminders). The new
 * reminders are scheduled first and only then are the ones no longer wanted cancelled, so a schedule that fails
 * leaves the old reminders in place.
 */
export async function syncLocalReminders(
  plugin: LocalPlugin,
  items: readonly ScheduleItem[],
  prefs: SchedulePrefs,
  now: Date = new Date(),
): Promise<SyncResult> {
  if ((await plugin.checkPermissions()).display !== 'granted') {
    return { scheduled: 0, reason: 'PERMISSION_DENIED' }
  }
  const plan = planLocalReminders(items, prefs, now)
  if (plan.length > 0) {
    await plugin.schedule({
      notifications: plan.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        channelId: CHANNEL_ID,
        schedule: { at: new Date(r.at), allowWhileIdle: true },
        extra: { url: r.url, tag: r.tag },
      })),
    })
  }
  await cancelReminders(plugin, new Set(plan.map((r) => r.id)))
  return { scheduled: plan.length }
}

/** The "Send test" button on the Fire: a notification on this device in a moment. */
export async function sendLocalTest(plugin: LocalPlugin, now: Date = new Date()): Promise<void> {
  if ((await plugin.checkPermissions()).display !== 'granted') {
    throw new Error('Notifications are blocked for this app. Allow them in the tablet settings.')
  }
  await plugin.schedule({
    notifications: [
      {
        id: 1,
        title: 'Test from Chắt Chiu',
        body: 'Notifications are working on this device.',
        channelId: CHANNEL_ID,
        schedule: { at: new Date(now.getTime() + SOON_MS), allowWhileIdle: true },
        extra: { url: '/settings', tag: 'push-test' },
      },
    ],
  })
}

const readSeen = (storage: Storage): number[] => {
  try {
    const raw: unknown = JSON.parse(storage.getItem(LOW_SEEN_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : []
  } catch {
    // A damaged list: start again. The worst case is one repeated alert.
    return []
  }
}

/** F-NT-03 on this device: "Butter is running low (15%)" once, not again until the item is restocked. */
export async function notifyLowStock(
  plugin: LocalPlugin,
  item: { itemId: number; name: string; percent: number },
  now: Date = new Date(),
  storage: Storage,
): Promise<boolean> {
  // Only a tablet reminders were turned on for shows the alert (the flag holds a user id).
  if (!storage.getItem(REGISTERED_KEY)) return false
  if ((await plugin.checkPermissions()).display !== 'granted') return false
  const seen = readSeen(storage)
  if (seen.includes(item.itemId)) return false
  const text = lowStockReminder([item.name])
  await plugin.schedule({
    notifications: [
      {
        id: 1_000_000 + (item.itemId % 1_000_000),
        title: text.title,
        body: `${cleanName(item.name)} is running low (${Math.round(item.percent)}%)`,
        channelId: CHANNEL_ID,
        schedule: { at: new Date(now.getTime() + SOON_MS), allowWhileIdle: true },
        extra: { url: text.url, tag: text.tag },
      },
    ],
  })
  storage.setItem(LOW_SEEN_KEY, JSON.stringify([...seen, item.itemId]))
  return true
}

/** The item was restocked: it may alert again the next time it runs low. */
export function clearLowStockSeen(itemId: number, storage: Storage): void {
  storage.setItem(LOW_SEEN_KEY, JSON.stringify(readSeen(storage).filter((id) => id !== itemId)))
}
