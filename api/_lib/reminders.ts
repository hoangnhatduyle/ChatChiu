import { DEFAULT_NOTIFY_HOUR, DEFAULT_TIMEZONE } from '@chatchiu/contracts';
import {
  cleanName as cleanNameText,
  daysLeft,
  expiryReminder,
  isLowStock,
  localHourInTimeZone,
  lowStockReminder,
  nameList as nameListText,
  todayInTimeZone,
} from '@chatchiu/domain';
import type { PushPayload } from './push.js';

// Pure planning for the scheduled send job (architecture.md §6.5, AC-API-18/19).

export interface ReminderItem {
  id: number;
  user_id: string;
  name: string;
  expiration_date: string | null;
  notification_enabled: boolean | null;
  notification_days_before: number | null;
  quantity: number;
  initial_quantity: number | null;
  current_quantity: number | null;
  low_stock_threshold: number | null;
  low_stock_notified_at: string | null;
}

export interface ReminderPrefs {
  timezone: string;
  notify_hour: number;
  expiry_alerts: boolean;
  low_stock_alerts: boolean;
  last_expiry_reminder_on: string | null;
}

export interface UserPlan {
  localToday: string;
  /** Her notify hour has come and today's expiry run has not happened yet. */
  expiryRunDue: boolean;
  expiring: ReminderItem[];
  /** Low and not alerted yet. */
  lowStock: ReminderItem[];
  /** Alerted earlier but no longer low (edited, restocked, threshold changed in either app). */
  staleLowStockMarkers: number[];
}

const DEFAULT_DAYS_BEFORE = 3;

/** A user with no preferences row: UTC, notify hour 9, alerts on (decided 2026-11-16). */
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  timezone: DEFAULT_TIMEZONE,
  notify_hour: DEFAULT_NOTIFY_HOUR,
  expiry_alerts: true,
  low_stock_alerts: true,
  last_expiry_reminder_on: null,
};

function low(i: ReminderItem): boolean {
  return isLowStock({
    quantity: Number(i.quantity),
    initialQuantity: i.initial_quantity == null ? null : Number(i.initial_quantity),
    currentQuantity: i.current_quantity == null ? null : Number(i.current_quantity),
    lowStockThreshold: i.low_stock_threshold == null ? null : Number(i.low_stock_threshold),
  });
}

export function planForUser(
  items: readonly ReminderItem[],
  prefs: ReminderPrefs,
  now: Date,
): UserPlan {
  const localToday = todayInTimeZone(prefs.timezone, now);
  const expiryRunDue =
    prefs.expiry_alerts &&
    localHourInTimeZone(prefs.timezone, now) >= prefs.notify_hour &&
    prefs.last_expiry_reminder_on !== localToday;
  const expiring = expiryRunDue
    ? items.filter((i) => {
        if (i.notification_enabled === false || i.expiration_date == null) return false;
        const days = daysLeft(i.expiration_date, localToday);
        return days >= 0 && days <= (i.notification_days_before ?? DEFAULT_DAYS_BEFORE);
      })
    : [];
  return {
    localToday,
    expiryRunDue,
    expiring,
    lowStock: prefs.low_stock_alerts
      ? items.filter((i) => i.low_stock_notified_at == null && low(i))
      : [],
    staleLowStockMarkers: items
      .filter((i) => i.low_stock_notified_at != null && !low(i))
      .map((i) => i.id),
  };
}

/** Item names as plain, short text (shared wording: packages/domain reminder-text). */
export const cleanName = cleanNameText;

/** "A, B, C and 2 more": bounded, so a payload always fits Web Push's ~4 KB. */
export function nameList(items: readonly ReminderItem[]): string {
  return nameListText(items.map((i) => i.name));
}

/** Same wording as the old job; the tag no longer carries the user id. */
export function expiryPayload(items: readonly ReminderItem[], localToday: string): PushPayload {
  return expiryReminder(
    items.map((i) => i.name),
    localToday,
  );
}

export function lowStockPayload(items: readonly ReminderItem[]): PushPayload {
  return lowStockReminder(items.map((i) => i.name));
}
