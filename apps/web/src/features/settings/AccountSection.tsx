// Account (F-SE-07, 7.0.24): Sign out ends this device's session only. If notifications are on here, this
// device's subscription is removed first, so it stops receiving her reminders; if that fails the sign-out waits
// and says why, with "Sign out anyway" for when she wants to go regardless.
import { useState } from 'react'
import { useSession } from '../../core/session-context'
import { Button } from '../../ui/Button'
import { SectionCard } from './SectionCard'
import type { DeviceNotifications } from './use-device-notifications'

export function AccountSection({ notifications }: { notifications: DeviceNotifications }) {
  const { signOut } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const leave = async (turnOffNotifications: boolean) => {
    setBusy(true)
    setError(null)
    if (turnOffNotifications && notifications.needsRemovalOnSignOut) {
      const problem = await notifications.disable()
      if (problem) {
        setError(`${problem} You are still signed in. Use Sign out anyway to leave regardless.`)
        setBusy(false)
        return
      }
    }
    if (!turnOffNotifications) {
      // "Sign out anyway": the server may still list this device, but it must stop showing reminders for this account.
      try {
        await notifications.forgetLocally()
      } catch {
        setError(
          "Couldn't stop this tablet's reminders. Turn them off in Settings first, or try again.",
        )
        setBusy(false)
        return
      }
    }
    const result = await signOut()
    // A signed-out screen replaces this page; only a failure stays here.
    if (!result.success) {
      setError(`Couldn't sign you out. ${result.message}`)
      setBusy(false)
    }
  }

  return (
    <SectionCard title="Account">
      {error && (
        <p role="alert" className="text-md font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" isDisabled={busy} onPress={() => void leave(true)}>
          Sign out
        </Button>
        {error && (
          <Button variant="ghost" isDisabled={busy} onPress={() => void leave(false)}>
            Sign out anyway
          </Button>
        )}
      </div>
    </SectionCard>
  )
}
