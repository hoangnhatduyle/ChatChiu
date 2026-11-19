import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyCors } from '../../_lib/cors.js';
import { withErrorHandler, ApiError } from '../../_lib/errors.js';
import { env } from '../../_lib/env.js';
import { serviceClient } from '../../_lib/supabase.js';
import { fetchAll } from '../../_lib/paging.js';
import {
  deliverPush,
  type DeliveryFailure,
  type PushPayload,
  type PushSubscriptionRow,
} from '../../_lib/push.js';
import {
  DEFAULT_REMINDER_PREFS,
  expiryPayload,
  lowStockPayload,
  planForUser,
  type ReminderItem,
  type ReminderPrefs,
} from '../../_lib/reminders.js';

// GET /api/cron/check-expirations (CRON_SECRET bearer) - the scheduled send job.
// Runs once a day from the cron in vercel.json (Hobby plan: one run per day, 14:00 UTC, which is 9:00 or 10:00 in
// New York); on a plan with hourly schedules it can run hourly instead (architecture.md §6.5). Vercel sends the
// CRON_SECRET as the bearer token. Per user:
//   - expiry: at most one grouped reminder per local day, in the first run at or
//     after her notify hour (user_preferences.last_expiry_reminder_on, AC-API-18)
//   - low stock: one push per crossing; low_stock_notified_at stays set while the
//     item is low and is cleared once it is not (restock or any edit, AC-API-19)
//   - only to channel 'web-push' devices (the Fire notifies itself, §6.4)
//   - 404/410 subscriptions are deleted; every failure is a push_failures row (AC-API-20)
// Each send is claimed first with a conditional update, so overlapping runs never
// send twice; if every device fails the claim is released and the next run retries.
// The service role is used only here (NC-API-SERVICE-ROLE).

const ITEM_COLUMNS =
  'id, user_id, name, expiration_date, notification_enabled, notification_days_before, quantity, initial_quantity, current_quantity, low_stock_threshold, low_stock_notified_at';

interface Counters {
  checked: number;
  due: number;
  usersNotified: number;
  pushesSent: number;
  lowStockSent: number;
  failures: number;
  markFailures: number;
  userErrors: number;
}

function assertCronAuth(req: VercelRequest): void {
  const secret = env.cronSecret;
  if (!secret) throw new ApiError('INTERNAL', 'CRON_SECRET is not configured');
  const given = Buffer.from(req.headers.authorization ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new ApiError('UNAUTHORIZED', 'Invalid cron authorization');
  }
}

/** Push failures older than this many days are deleted on every run. */
export const PUSH_FAILURE_RETENTION_DAYS = 30;

/** Log a failed bookkeeping write and count it; never throws. */
function checkWrite(c: Counters, what: string, error: unknown): boolean {
  if (!error) return true;
  c.markFailures++;
  console.error(`[cron] ${what} failed`, error);
  return false;
}

async function send(
  db: SupabaseClient,
  c: Counters,
  userId: string,
  subs: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<number> {
  const { sent, failures } = await deliverPush(subs, payload);
  c.failures += failures.length;
  if (failures.length > 0) {
    const recorded = await db.from('push_failures').insert(
      failures.map((f: DeliveryFailure) => ({
        user_id: userId,
        endpoint: f.endpoint,
        status_code: f.statusCode,
        message: f.message,
      })),
    );
    checkWrite(c, 'recording push failures', recorded.error);
    const gone = failures.filter((f) => f.gone).map((f) => f.endpoint);
    if (gone.length > 0) {
      const removed = await db
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .in('endpoint', gone);
      checkWrite(c, 'deleting dead subscriptions', removed.error);
    }
  }
  c.pushesSent += sent;
  return sent;
}

async function expiryRun(
  db: SupabaseClient,
  c: Counters,
  userId: string,
  prefs: ReminderPrefs,
  plan: ReturnType<typeof planForUser>,
  subs: PushSubscriptionRow[],
  now: Date,
): Promise<void> {
  // Claim today's run (DUE -> SENT_TODAY) before sending; a row is created with
  // the column defaults when she has none yet.
  const ensured = await db
    .from('user_preferences')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (!checkWrite(c, 'creating preferences row', ensured.error)) return;
  const claimed = await db
    .from('user_preferences')
    .update({ last_expiry_reminder_on: plan.localToday })
    .eq('user_id', userId)
    .or(`last_expiry_reminder_on.is.null,last_expiry_reminder_on.neq.${plan.localToday}`)
    .select('user_id');
  if (!checkWrite(c, 'claiming the expiry run', claimed.error) || (claimed.data ?? []).length === 0)
    return;

  // Nothing due, or no device to reach: the day is done.
  if (plan.expiring.length === 0 || subs.length === 0) return;

  const sent = await send(db, c, userId, subs, expiryPayload(plan.expiring, plan.localToday));
  if (sent === 0) {
    // Every device failed: stay DUE so the next hourly run retries.
    const released = await db
      .from('user_preferences')
      .update({ last_expiry_reminder_on: prefs.last_expiry_reminder_on })
      .eq('user_id', userId)
      .eq('last_expiry_reminder_on', plan.localToday);
    checkWrite(c, 'releasing the expiry run', released.error);
    return;
  }
  c.usersNotified++;
  const stamped = await db
    .from('inventory_items')
    .update({ last_notified_at: now.toISOString() })
    .in(
      'id',
      plan.expiring.map((i) => i.id),
    );
  checkWrite(c, 'stamping last_notified_at', stamped.error);
}

async function lowStockRun(
  db: SupabaseClient,
  c: Counters,
  userId: string,
  plan: ReturnType<typeof planForUser>,
  subs: PushSubscriptionRow[],
  now: Date,
): Promise<void> {
  if (plan.staleLowStockMarkers.length > 0) {
    const cleared = await db
      .from('inventory_items')
      .update({ low_stock_notified_at: null })
      .in('id', plan.staleLowStockMarkers);
    checkWrite(c, 'clearing stale low-stock markers', cleared.error);
  }
  if (plan.lowStock.length === 0 || subs.length === 0) return;

  const stamp = now.toISOString();
  const claimed = await db
    .from('inventory_items')
    .update({ low_stock_notified_at: stamp })
    .in(
      'id',
      plan.lowStock.map((i) => i.id),
    )
    .is('low_stock_notified_at', null)
    .select('id');
  if (!checkWrite(c, 'claiming low-stock items', claimed.error)) return;
  const ids = new Set((claimed.data ?? []).map((r) => r.id as number));
  const items = plan.lowStock.filter((i) => ids.has(i.id));
  if (items.length === 0) return;

  const sent = await send(db, c, userId, subs, lowStockPayload(items));
  if (sent === 0) {
    const released = await db
      .from('inventory_items')
      .update({ low_stock_notified_at: null })
      .in('id', [...ids])
      .eq('low_stock_notified_at', stamp);
    checkWrite(c, 'releasing low-stock items', released.error);
    return;
  }
  c.lowStockSent += items.length;
}

export default withErrorHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', 'Allowed methods: GET');
  assertCronAuth(req);
  const db = serviceClient();
  const now = new Date();
  // push_failures only needs recent history: older rows are dropped here (roadmap 7.0.13f). A failure to prune is logged
  // and never stops the reminders.
  const failureCutoff = new Date(now.getTime() - PUSH_FAILURE_RETENTION_DAYS * 86_400_000).toISOString();
  const pruned = await db.from('push_failures').delete().lt('created_at', failureCutoff);

  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    return { skipped: true, reason: 'VAPID keys not configured' };
  }

  const [items, prefs, subs] = await Promise.all([
    fetchAll<ReminderItem>(
      (from, to) => db.from('inventory_items').select(ITEM_COLUMNS).order('id').range(from, to),
      'items',
    ),
    fetchAll<ReminderPrefs & { user_id: string }>(
      (from, to) =>
        db
          .from('user_preferences')
          .select(
            'user_id, timezone, notify_hour, expiry_alerts, low_stock_alerts, last_expiry_reminder_on',
          )
          .order('user_id')
          .range(from, to),
      'preferences',
    ),
    fetchAll<PushSubscriptionRow & { user_id: string }>(
      (from, to) =>
        db
          .from('push_subscriptions')
          .select('user_id, endpoint, p256dh, auth')
          .eq('channel', 'web-push')
          .order('id')
          .range(from, to),
      'subscriptions',
    ),
  ]);

  const prefsByUser = new Map(prefs.map((p) => [p.user_id, p]));
  const subsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const s of subs) {
    subsByUser.set(s.user_id, [
      ...(subsByUser.get(s.user_id) ?? []),
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
    ]);
  }
  const itemsByUser = new Map<string, ReminderItem[]>();
  for (const i of items) itemsByUser.set(i.user_id, [...(itemsByUser.get(i.user_id) ?? []), i]);

  const c: Counters = {
    checked: items.length,
    due: 0,
    usersNotified: 0,
    pushesSent: 0,
    lowStockSent: 0,
    failures: 0,
    markFailures: 0,
    userErrors: 0,
  };
  checkWrite(c, 'pruning old push failures', pruned.error);

  for (const [userId, userItems] of itemsByUser) {
    // One user's problem (e.g. an unexpected error) never stops the others.
    try {
      const userPrefs = prefsByUser.get(userId) ?? DEFAULT_REMINDER_PREFS;
      const plan = planForUser(userItems, userPrefs, now);
      const userSubs = subsByUser.get(userId) ?? [];
      c.due += plan.expiring.length;
      if (plan.expiryRunDue) await expiryRun(db, c, userId, userPrefs, plan, userSubs, now);
      await lowStockRun(db, c, userId, plan, userSubs, now);
    } catch (err) {
      c.userErrors++;
      console.error('[cron] user run failed', userId, err instanceof Error ? err.message : err);
    }
  }

  return c;
});
