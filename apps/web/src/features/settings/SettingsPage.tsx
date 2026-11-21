// Settings (SPEC-SE-001, SPEC-NT-001; route /settings): notifications, appearance, data and sign out on a two-column row,
// then locations and categories as full-width list-and-editor cards. Everything goes through the data hooks and core/notify (AR-NO-DIRECT-API).
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
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <NotificationsSection notifications={notifications} />
          <div className="flex flex-col gap-6">
            <AppearanceSection />
            <DataSection />
            <AccountSection notifications={notifications} />
          </div>
        </div>
        <LocationsSection />
        <CategoriesSection />
      </div>
    </div>
  )
}
