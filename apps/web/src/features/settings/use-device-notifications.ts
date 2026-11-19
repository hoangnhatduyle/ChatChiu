// This device's notification state for the Settings screen (SPEC-NT-001). The browser side is
// core/notify/webPush.ts; saving and removing the subscription go through the data layer's writes.
import { useCallback, useEffect, useState } from 'react'
import { userMessage } from '../../core/errors'
import { useSession } from '../../core/session-context'
import {
  disableLocal,
  enableLocal,
  forgetLocal,
  isNativeShell,
  isRegistered,
  loadLocalPlugin,
  localDeviceId,
  readLocalState,
  REMINDERS_CHANGED,
  sendLocalTest,
} from '../../core/notify/localNotify'
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
  /** Leaving without the server (Sign out anyway): on the Fire, stop this tablet's reminders at least. */
  forgetLocally: () => Promise<void>
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
  const native = isNativeShell()
  const userId = useSession().user?.id ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    const check = () => {
      // On the Fire the browser has no push: reminders are scheduled on the device itself (localNotify.ts).
      const read = native
        ? loadLocalPlugin().then((plugin) =>
            readLocalState(
              plugin,
              localDeviceId(window.localStorage),
              isRegistered(window.localStorage, userId),
            ),
          )
        : readDeviceState(defaultPushEnv(), VAPID_PUBLIC_KEY)
      read
        .then((state) => current && setDevice(state))
        .catch((cause: unknown) => {
          console.error('Could not read the notification state of this device', cause)
          if (!current) return
          setDevice({ state: 'UNKNOWN' })
          setError("Couldn't check notifications on this device.")
        })
    }
    check()
    // Coming back from the tablet's settings (permission allowed or revoked there): read the state again.
    const onVisible = () => document.visibilityState === 'visible' && native && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [native, userId])

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
        console.error(failure, e)
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
    const result = await run(async () => {
      const register = (sub: Parameters<typeof save>[0]) => saved(save(sub)).then(() => undefined)
      if (!native) return enableDevice(defaultPushEnv(), VAPID_PUBLIC_KEY, register)
      const state = await enableLocal(
        await loadLocalPlugin(),
        localDeviceId(window.localStorage),
        register,
        window.localStorage,
        userId,
      )
      // The schedule is built from the items as soon as this device is registered.
      window.dispatchEvent(new Event(REMINDERS_CHANGED))
      return state
    }, "Couldn't turn on notifications.")
    if ('value' in result) setDevice(result.value)
  }, [run, save, native, userId])

  const disable = useCallback(async () => {
    const result = await run(async () => {
      const forget = (endpoint: string) => saved(remove({ endpoint })).then(() => undefined)
      if (native)
        await disableLocal(
          await loadLocalPlugin(),
          localDeviceId(window.localStorage),
          forget,
          window.localStorage,
        )
      else await disableDevice(defaultPushEnv(), forget)
    }, "Couldn't turn off notifications.")
    if ('message' in result) return result.message
    setDevice({ state: 'OFF' })
    return null
  }, [run, remove, native])

  const endpoint = device?.state === 'ON' ? device.endpoint : null
  const sendTest = useCallback(async () => {
    if (!endpoint) return false
    const result = await run(
      async () => (native ? sendLocalTest(await loadLocalPlugin()) : saved(test({ endpoint }))),
      "Couldn't send the test.",
    )
    return 'value' in result
  }, [run, test, endpoint, native])

  // Still checking, failed to check, a stale key or on: all may hold a subscription the server knows.
  const state = device?.state ?? 'UNKNOWN'
  const needsRemovalOnSignOut = state === 'ON' || state === 'KEY_MISMATCH' || state === 'UNKNOWN'

  const forgetLocally = useCallback(async () => {
    if (native) await forgetLocal(await loadLocalPlugin(), window.localStorage)
  }, [native])

  return { device, busy, error, enable, disable, sendTest, needsRemovalOnSignOut, forgetLocally }
}
