import type { Bootstrap, DashboardSummaryV2 } from '@chatchiu/contracts';
import { preferencesQuery } from '../_lib/schemas.js';
import { authedHandler, assertMethod } from '../_lib/handler.js';
import { ApiError } from '../_lib/errors.js';
import { parseQuery } from '../_lib/validation.js';
import { toCamelList } from '../_lib/mappers.js';
import { userClock } from '../_lib/clock.js';

// GET /api/bootstrap[?tz=] — items, locations, categories and the v2 summary in
// one round trip (architecture.md §3.1, AC-API-06). "Today" is her local date.
export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['GET']);
  const { tz } = parseQuery(req, preferencesQuery);
  const { today } = await userClock(client, tz);

  const { data, error } = await client.rpc('inventory_snapshot', { p_today: today });
  if (error) throw new ApiError('INTERNAL', 'Failed to load the kitchen', error);
  const snap = data as {
    items: Record<string, unknown>[];
    locations: Record<string, unknown>[];
    categories: Record<string, unknown>[];
    summary: DashboardSummaryV2;
  };
  return {
    items: toCamelList(snap.items),
    locations: toCamelList(snap.locations),
    categories: toCamelList(snap.categories),
    summary: snap.summary,
  } as unknown as Bootstrap;
});
