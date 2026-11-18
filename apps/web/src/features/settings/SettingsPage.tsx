// Settings (SPEC-SE-001, SPEC-NT-001; route /settings): locations, categories, notifications, appearance,
// data and sign out. Everything goes through the data hooks and core/notify (AR-NO-DIRECT-API).
import { PageTitle } from '../../shell/PageTitle'
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
    <div className="max-w-3xl px-4 pt-5 pb-8 md:px-6 md:pt-6">
      <PageTitle>Settings</PageTitle>
      <div className="mt-4 flex flex-col gap-6">
        <NotificationsSection notifications={notifications} />
        <AppearanceSection />
        <LocationsSection />
        <CategoriesSection />
        <DataSection />
        <AccountSection notifications={notifications} />
      </div>
    </div>
  )
}
