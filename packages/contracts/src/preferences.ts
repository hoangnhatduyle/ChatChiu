import { z } from 'zod'

export const theme = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof theme>

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const ianaTimeZone = z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown time zone')

export interface Preferences {
  timezone: string
  /** Local hour 0–23. */
  notifyHour: number
  expiryAlerts: boolean
  lowStockAlerts: boolean
  theme: Theme
}

/** PATCH /api/preferences — no defaults: only the fields sent change (AC-API-17). */
export const preferencesUpdate = z.object({
  timezone: ianaTimeZone.optional(),
  notifyHour: z.coerce.number().int().min(0).max(23).optional(),
  expiryAlerts: z.boolean().optional(),
  lowStockAlerts: z.boolean().optional(),
  theme: theme.optional(),
})
export type PreferencesUpdate = z.infer<typeof preferencesUpdate>

/** GET /api/preferences?tz= — an invalid zone is dropped, never a 400. */
export const preferencesQuery = z.object({
  tz: ianaTimeZone.optional().catch(undefined),
})

export const DEFAULT_TIMEZONE = 'UTC'
export const DEFAULT_NOTIFY_HOUR = 9

/** Defaults when she has no user_preferences row yet (decided 2026-11-16). */
export function defaultPreferences(deviceTimeZone: string | undefined): Preferences {
  return {
    timezone: deviceTimeZone && isValidTimeZone(deviceTimeZone) ? deviceTimeZone : DEFAULT_TIMEZONE,
    notifyHour: DEFAULT_NOTIFY_HOUR,
    expiryAlerts: true,
    lowStockAlerts: true,
    theme: 'system',
  }
}

// Web Push services the app may send to. A subscription endpoint is a URL the
// server-side send job POSTs to, so anything else would be SSRF (step 2.4 review).
const PUSH_HOST_PATTERNS: readonly RegExp[] = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/, // legacy GCM endpoints on older Chrome subscriptions
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
]

/** https, default port, and a known push-service host. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    PUSH_HOST_PATTERNS.some((re) => re.test(url.hostname))
  )
}

// Push subscription body; lives with the notification preferences (decided in step 2.1).
export const pushSubscribe = z.object({
  endpoint: z.string().url().max(2000).refine(isAllowedPushEndpoint, 'Unknown push service'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
})
export type PushSubscribe = z.infer<typeof pushSubscribe>

/**
 * A Fire tablet shell notifies itself on the device (architecture.md §6.4): it registers as a `local` device, so the
 * server knows it exists and never pushes to it. `deviceId` is made once on the device.
 */
export const pushSubscribeLocal = z.object({
  channel: z.literal('local'),
  deviceId: z.string().uuid(),
})
export type PushSubscribeLocal = z.infer<typeof pushSubscribeLocal>

/** POST /api/push/subscribe takes either shape. */
export const pushSubscribeBody = z.union([pushSubscribeLocal, pushSubscribe])

/** POST /api/push/test: the device that pressed the button names itself; without an endpoint every device gets it. */
export const pushTest = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine(isAllowedPushEndpoint, 'Unknown push service')
    .optional(),
})
