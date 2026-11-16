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

// Push subscription body; lives with the notification preferences (decided in step 2.1).
export const pushSubscribe = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
})
export type PushSubscribe = z.infer<typeof pushSubscribe>
