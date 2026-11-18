// Fire shell only: on launch, say the running bundle is healthy (the updater rolls back one that never does) and
// look for a newer web bundle (live-update.ts). A failure is shown in words; the running bundle stays.
// In a browser this renders nothing and loads nothing.
import { useEffect } from 'react'
import { isNativeShell } from '../notify/localNotify'
import { useToast } from '../toast-context'
import { checkForUpdate, type Updater } from './live-update'

/** The live site the bundles come from, and the public key their signature is checked with (README.md). */
const LIVE_SITE: string = import.meta.env.VITE_LIVE_SITE_URL ?? ''
const UPDATE_KEY: string = import.meta.env.VITE_LIVE_UPDATE_PUBLIC_KEY ?? ''

export function LiveUpdateCheck() {
  return isNativeShell() ? <Check /> : null
}

function Check() {
  const toasts = useToast()
  useEffect(() => {
    let current = true
    const say = (message: string) => current && toasts.show({ message, tone: 'error' })
    void (async () => {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
      const updater = CapacitorUpdater as unknown as Updater
      try {
        await updater.notifyAppReady()
      } catch {
        // Without this the updater may go back to the previous version on its own: say so, then still look for updates.
        say(
          "Couldn't confirm that this version of the app is working. It may go back to the previous one.",
        )
      }
      if (!LIVE_SITE || !UPDATE_KEY) return
      const result = await checkForUpdate(updater, LIVE_SITE, {
        builtinVersion: import.meta.env.VITE_APP_VERSION ?? '',
        publicKey: UPDATE_KEY,
      })
      if (result.status === 'failed') say(`Couldn't check for a new version. ${result.message}`)
    })().catch(() => say("Couldn't start the update check."))
    return () => {
      current = false
    }
  }, [toasts])
  return null
}
