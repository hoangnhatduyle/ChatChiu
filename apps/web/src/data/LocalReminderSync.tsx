// On the Fire tablet shell only (SPEC-NT-001 outcome B): keeps the reminders scheduled ON the device in step with her
// items and preferences. It rebuilds the schedule 2 s after the data changes, when the app comes back to the front
// and when this device is turned on, tries again after a failure, and opens the right page when a reminder is tapped.
// In a browser it renders nothing and asks for nothing (the hooks live in an inner component).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  isNativeShell,
  isRegistered,
  loadLocalPlugin,
  REMINDERS_CHANGED,
  syncLocalReminders,
} from '../core/notify/localNotify'
import { useSession } from '../core/session-context'
import { useToast } from '../core/toast-context'
import { useBootstrapQuery } from './inventory'
import { usePreferencesQuery } from './preferences'

/** Wait for edits to settle before rebuilding the schedule. */
const SYNC_DELAY_MS = 2000
/** After a failed rebuild: try again this often, this many times (then the next edit or return to the app tries). */
const RETRY_MS = 60_000
const MAX_RETRIES = 5
const SYNC_FAILED = "Couldn't update the reminders on this device. Trying again in a minute."
const BLOCKED =
  "Notifications are blocked for Chắt Chiu on this tablet, so reminders won't show. Allow them in the tablet's settings."

export function LocalReminderSync() {
  return isNativeShell() ? <Scheduler /> : null
}

function Scheduler() {
  const items = useBootstrapQuery().data?.items
  const prefs = usePreferencesQuery().data
  const userId = useSession().user?.id ?? ''
  const toasts = useToast()
  const navigate = useNavigate()
  const [nudge, setNudge] = useState(0)
  const failures = useRef(0)
  const blockedTold = useRef(false)

  useEffect(() => {
    const bump = () => setNudge((n) => n + 1)
    const onVisible = () => document.visibilityState === 'visible' && bump()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(REMINDERS_CHANGED, bump)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(REMINDERS_CHANGED, bump)
    }
  }, [])

  useEffect(() => {
    if (!items || !prefs || !userId) return
    let retry: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      // Checked when the timer fires, not only when it was set: she may have turned reminders off since.
      if (!isRegistered(window.localStorage, userId)) return
      void (async () => {
        try {
          const plugin = await loadLocalPlugin()
          const result = await syncLocalReminders(
            plugin,
            items.map((i) => ({
              id: i.id,
              name: i.name,
              expirationDate: i.expirationDate,
              notificationEnabled: i.notificationEnabled,
              notificationDaysBefore: i.notificationDaysBefore,
            })),
            {
              timezone: prefs.timezone,
              notifyHour: prefs.notifyHour,
              expiryAlerts: prefs.expiryAlerts,
            },
          )
          failures.current = 0
          if (result.reason === 'PERMISSION_DENIED') {
            // Settings shows the same when it is opened; this says it where she is, once.
            if (!blockedTold.current) toasts.show({ message: BLOCKED, tone: 'error' })
            blockedTold.current = true
          } else {
            blockedTold.current = false
          }
        } catch {
          if (failures.current === 0) toasts.show({ message: SYNC_FAILED, tone: 'error' })
          failures.current += 1
          if (failures.current <= MAX_RETRIES)
            retry = setTimeout(() => setNudge((n) => n + 1), RETRY_MS)
        }
      })()
    }, SYNC_DELAY_MS)
    return () => {
      clearTimeout(timer)
      clearTimeout(retry)
    }
  }, [items, prefs, userId, nudge, toasts])

  // Tapping a reminder opens the page it names (only a path of this app).
  useEffect(() => {
    let remove: (() => void) | undefined
    let current = true
    void import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
      const handle = await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event) => {
          const url = event.notification.extra?.url
          if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
            void navigate(url)
          }
        },
      )
      if (current) remove = () => void handle.remove()
      else void handle.remove()
    })
    return () => {
      current = false
      remove?.()
    }
  }, [navigate])
  return null
}
