import { DEFAULT_NOTIFY_HOUR, DEFAULT_TIMEZONE } from '@chatchiu/contracts';
import { daysLeft, isLowStock, localHourInTimeZone, todayInTimeZone } from '@chatchiu/domain';
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
const MAX_NAME = 60;
const MAX_NAMES = 3;

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

/** Item names as plain, short text: control characters removed, at most 60 characters. */
export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const plain = name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return plain.length > MAX_NAME ? `${plain.slice(0, MAX_NAME - 1)}…` : plain;
}

/** "A, B, C and 2 more": bounded, so a payload always fits Web Push's ~4 KB. */
export function nameList(items: readonly ReminderItem[]): string {
  const names = items.slice(0, MAX_NAMES).map((i) => cleanName(i.name));
  const more = items.length - names.length;
  return more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ');
}

/** Same wording as the old job; the tag no longer carries the user id. */
export function expiryPayload(items: readonly ReminderItem[], localToday: string): PushPayload {
  const count = items.length;
  return {
    title: count === 1 ? 'Item expiring soon' : `${count} items expiring soon`,
    body: count === 1 ? `${cleanName(items[0]?.name ?? '')} expires soon` : nameList(items),
    url: '/inventory',
    tag: `expiring-${localToday}`,
  };
}

export function lowStockPayload(items: readonly ReminderItem[]): PushPayload {
  const count = items.length;
  return {
    title: count === 1 ? 'Running low' : `${count} items running low`,
    body: count === 1 ? `${cleanName(items[0]?.name ?? '')} is running low` : nameList(items),
    url: '/',
    tag: 'low-stock',
  };
}
