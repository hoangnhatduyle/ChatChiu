// This device's notification state for the Settings screen (SPEC-NT-001). The browser side is
// core/notify/webPush.ts; saving and removing the subscription go through the data layer's writes.
import { useCallback, useEffect, useState } from 'react'
import { userMessage } from '../../core/errors'
import {
  defaultPushEnv,
  disableDevice,
  enableDevice,
  readDeviceState,
  type DeviceState,
} from '../../core/notify/webPush'
import { removePushSubscription, savePushSubscription, sendTestPush } from '../../data/push'
import { useWrite, type WriteHandle } from '../../data/write'

/** The VAPID public key comes from the build, never from source (NC-NT-NO-HARDCODED-VAPID). */
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

export type DeviceNotifications = {
  /** Null while the browser is being asked. */
  device: DeviceState | null
  busy: boolean
  /** Why the last action failed, in words for her. */
  error: string | null
  enable: () => Promise<void>
  /** Null when this device is off; otherwise why it could not be turned off. */
  disable: () => Promise<string | null>
  sendTest: () => Promise<boolean>
  /** True when something may be subscribed here that sign-out must remove first. */
  needsRemovalOnSignOut: boolean
}

/** Waits for a write and throws its error, so the browser-side helpers see a failed save as a failure. */
async function saved<T>(handle: WriteHandle<T>): Promise<T> {
  const result = await handle.result
  if (result.status === 'saved') return result.data
  throw result.status === 'failed' ? result.error : new Error('Cancelled')
}

export function useDeviceNotifications(): DeviceNotifications {
  const save = useWrite(savePushSubscription)
  const remove = useWrite(removePushSubscription)
  const test = useWrite(sendTestPush)
  const [device, setDevice] = useState<DeviceState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    readDeviceState(defaultPushEnv(), VAPID_PUBLIC_KEY)
      .then((state) => current && setDevice(state))
      .catch(() => {
        if (!current) return
        setDevice({ state: 'UNKNOWN' })
        setError("Couldn't check notifications on this device.")
      })
    return () => {
      current = false
    }
  }, [])

  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      failure: string,
    ): Promise<{ value: T } | { message: string }> => {
      setBusy(true)
      setError(null)
      try {
        return { value: await action() }
      } catch (e) {
        const message = `${failure} ${userMessage(e)}`
        setError(message)
        return { message }
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const enable = useCallback(async () => {
    const result = await run(
      () =>
        enableDevice(defaultPushEnv(), VAPID_PUBLIC_KEY, (sub) =>
          saved(save(sub)).then(() => undefined),
        ),
      "Couldn't turn on notifications.",
    )
    if ('value' in result) setDevice(result.value)
  }, [run, save])

  const disable = useCallback(async () => {
    const result = await run(
      () =>
        disableDevice(defaultPushEnv(), (endpoint) =>
          saved(remove({ endpoint })).then(() => undefined),
        ),
      "Couldn't turn off notifications.",
    )
    if ('message' in result) return result.message
    setDevice({ state: 'OFF' })
    return null
  }, [run, remove])

  const endpoint = device?.state === 'ON' ? device.endpoint : null
  const sendTest = useCallback(async () => {
    if (!endpoint) return false
    const result = await run(() => saved(test({ endpoint })), "Couldn't send the test.")
    return 'value' in result
  }, [run, test, endpoint])

  // Still checking, failed to check, a stale key or on: all may hold a subscription the server knows.
  const state = device?.state ?? 'UNKNOWN'
  const needsRemovalOnSignOut = state === 'ON' || state === 'KEY_MISMATCH' || state === 'UNKNOWN'

  return { device, busy, error, enable, disable, sendTest, needsRemovalOnSignOut }
}
