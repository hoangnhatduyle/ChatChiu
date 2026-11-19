// On start: a notification subscription made with a different VAPID key than this build's would never receive
// anything (the D17 root cause, SPEC-NT-001 KEY_MISMATCH). When notifications were allowed on this device, check
// once and subscribe again with the right key, telling her if that fails (NC-NT-NO-SILENT-FAILURE).
// The browser code loads only when the permission is already granted, so first paint is untouched.
import { useEffect } from 'react'
import { useToast } from '../core/toast-context'
import { savePushSubscription } from './push'
import { useWrite } from './write'

export function PushKeyCheck() {
  const save = useWrite(savePushSubscription)
  const toasts = useToast()
  useEffect(() => {
    const key: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''
    if (!key || !('Notification' in window) || Notification.permission !== 'granted') return
    let current = true
    void (async () => {
      const { defaultPushEnv, enableDevice, readDeviceState } =
        await import('../core/notify/webPush')
      const env = defaultPushEnv()
      if ((await readDeviceState(env, key)).state !== 'KEY_MISMATCH') return
      await enableDevice(env, key, async (subscription) => {
        const result = await save(subscription).result
        if (result.status !== 'saved')
          throw result.status === 'failed' ? result.error : new Error('Cancelled')
      })
    })().catch((cause: unknown) => {
      console.error('Could not refresh the notification subscription', cause)
      if (current)
        toasts.show({
          message: "Couldn't refresh notifications on this device. Open Settings to fix it.",
          tone: 'error',
        })
    })
    return () => {
      current = false
    }
    // Once per start: the write and toasts are stable for the life of the provider.
  }, [save, toasts])
  return null
}
