// Settings (SPEC-SE-001, SPEC-NT-001; route /settings): locations, categories, notifications, appearance,
// data and sign out. Everything goes through the data hooks and core/notify (AR-NO-DIRECT-API).
import { PAGE_FRAME } from '../../shell/page-frame'
import { PageHeader } from '../../shell/PageHeader'
import { AccountSection } from './AccountSection'
import { AppearanceSection } from './AppearanceSection'
import { CategoriesSection } from './CategoriesSection'
import { DataSection } from './DataSection'
import { LocationsSection } from './LocationsSection'
import { NotificationsSection } from './NotificationsSection'
import { useDeviceNotifications } from './use-device-notifications'

export default function SettingsPage() {
  const notifications = useDeviceNotifications()
  return (
    <div className={PAGE_FRAME}>
      <PageHeader title="Settings" subtitle="Your places, categories, reminders and look" />
      <div className="flex flex-col gap-6">
        <div className="flex max-w-3xl flex-col gap-6">
          <NotificationsSection notifications={notifications} />
          <AppearanceSection />
        </div>
        <LocationsSection />
        <div className="flex max-w-3xl flex-col gap-6">
          <CategoriesSection />
          <DataSection />
          <AccountSection notifications={notifications} />
        </div>
      </div>
    </div>
  )
}
