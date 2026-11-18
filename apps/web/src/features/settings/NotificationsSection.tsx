// Notifications (F-SE-03, SPEC-NT-001): this device's status in words, turn it on or off, a test, and her
// reminder settings (time zone, hour, the two alert kinds).
import type { Preferences, PreferencesUpdate } from '@chatchiu/contracts'
import { useToast } from '../../core/toast-context'
import { updatePreferences, usePreferencesQuery } from '../../data/preferences'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { LABEL } from '../../ui/Field'
import { Switch } from '../../ui/Switch'
import { SectionCard } from './SectionCard'
import type { DeviceNotifications } from './use-device-notifications'
import { hourLabel, timeZoneOptions } from './time-options'

const NATIVE_SELECT =
  'min-h-touch w-full rounded-control border border-field-line bg-surface px-3 text-base text-ink hover:bg-hover'

function DeviceStatus({ notifications }: { notifications: DeviceNotifications }) {
  const { device, busy, enable, disable, sendTest } = notifications
  const toasts = useToast()
  if (!device)
    return (
      <p role="status" className="text-md text-muted">
        Checking this device…
      </p>
    )

  const send = async () => {
    if (await sendTest()) toasts.show({ message: 'Test notification sent' })
  }
  switch (device.state) {
    case 'ON':
      return (
        <>
          <p role="status" className="text-base font-bold text-ink">
            This device: notifications on ✓
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" isDisabled={busy} onPress={() => void send()}>
              Send test notification
            </Button>
            <Button variant="secondary" isDisabled={busy} onPress={() => void disable()}>
              Turn off for this device
            </Button>
          </div>
        </>
      )
    case 'OFF':
      return (
        <>
          <p role="status" className="text-base font-bold text-ink">
            This device: notifications off
          </p>
          <Button
            variant="primary"
            isDisabled={busy}
            onPress={() => void enable()}
            className="self-start"
          >
            Turn on for this device
          </Button>
        </>
      )
    case 'KEY_MISMATCH':
      return (
        <>
          <p role="status" className="text-base font-bold text-ink">
            This device: notifications need to be set up again
          </p>
          <p className="text-md text-muted">
            This device was set up with an older key, so reminders would not arrive.
          </p>
          <Button
            variant="primary"
            isDisabled={busy}
            onPress={() => void enable()}
            className="self-start"
          >
            Fix notifications on this device
          </Button>
        </>
      )
    case 'NEEDS_HOME_SCREEN':
      return (
        <div className="flex flex-col gap-1">
          <p role="status" className="text-base font-bold text-ink">
            This device: needs the Home Screen app
          </p>
          <ol className="list-decimal pl-5 text-md text-muted">
            <li>Open this page in Safari and tap Share.</li>
            <li>Choose Add to Home Screen.</li>
            <li>Open Chắt Chiu from the Home Screen and come back here.</li>
          </ol>
        </div>
      )
    case 'PERMISSION_DENIED':
      return (
        <p role="status" className="text-md text-ink">
          <b>This device: notifications are blocked.</b> Allow notifications for Chắt Chiu in your
          browser or phone settings, then come back.
        </p>
      )
    case 'NOT_CONFIGURED':
      return (
        <p role="status" className="text-md text-ink">
          <b>This device:</b> notifications are not set up in this version of the app.
        </p>
      )
    case 'UNKNOWN':
      return (
        <p role="status" className="text-md text-ink">
          <b>This device:</b> couldn&apos;t check notifications here.
        </p>
      )
    case 'UNSUPPORTED':
      return (
        <p role="status" className="text-md text-ink">
          <b>This device:</b> this browser does not support notifications.
        </p>
      )
  }
}

function Reminders({ preferences }: { preferences: Preferences }) {
  const save = useWrite(updatePreferences)
  const change = (patch: PreferencesUpdate) => void save(patch)
  const zones = timeZoneOptions(preferences.timezone)
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Time zone</span>
        <select
          className={NATIVE_SELECT}
          value={preferences.timezone}
          onChange={(e) => change({ timezone: e.target.value })}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Reminder hour</span>
        <select
          className={NATIVE_SELECT}
          value={preferences.notifyHour}
          onChange={(e) => change({ notifyHour: Number(e.target.value) })}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {hourLabel(hour)}
            </option>
          ))}
        </select>
      </label>
      <Switch
        label="Expiry reminders"
        isSelected={preferences.expiryAlerts}
        onChange={(expiryAlerts) => change({ expiryAlerts })}
      />
      <Switch
        label="Low-stock alerts"
        isSelected={preferences.lowStockAlerts}
        onChange={(lowStockAlerts) => change({ lowStockAlerts })}
      />
    </div>
  )
}

export function NotificationsSection({ notifications }: { notifications: DeviceNotifications }) {
  const preferences = usePreferencesQuery()
  return (
    <SectionCard
      title="Reminders & alerts"
      description="One reminder a day for what is about to expire, and a note when something runs low."
    >
      <div className="flex flex-col gap-3">
        <DeviceStatus notifications={notifications} />
        {notifications.error && (
          <p role="alert" className="text-md font-semibold text-error">
            {notifications.error}
          </p>
        )}
      </div>
      {preferences.data ? (
        <Reminders preferences={preferences.data} />
      ) : preferences.isError ? (
        <p role="alert" className="text-md font-semibold text-error">
          Couldn&apos;t load your reminder settings.{' '}
          <Button variant="secondary" onPress={() => void preferences.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
    </SectionCard>
  )
}
