import type { Preferences, Theme } from '@chatchiu/contracts';

export interface PreferencesRow {
  user_id: string;
  timezone: string;
  notify_hour: number;
  expiry_alerts: boolean;
  low_stock_alerts: boolean;
  theme: Theme;
  last_expiry_reminder_on: string | null;
}

/** Row → the public Preferences shape (internal fields such as the reminder marker stay server-side). */
export function mapPreferences(row: PreferencesRow): Preferences {
  return {
    timezone: row.timezone,
    notifyHour: row.notify_hour,
    expiryAlerts: row.expiry_alerts,
    lowStockAlerts: row.low_stock_alerts,
    theme: row.theme,
  };
}
