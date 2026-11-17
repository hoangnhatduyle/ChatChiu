import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { clearPurchased } from '../../_lib/schemas.js';

// POST /api/shopping-list/clear-purchased { ids } — deletes, in one statement,
// only her rows in ids that are still purchased (decided 2026-11-16; AC-API-11).
export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['POST']);
  const { ids } = parseBody(req, clearPurchased);
  const { data, error } = await client.rpc('clear_purchased', { p_ids: ids });
  if (error) throw new ApiError('INTERNAL', 'Failed to clear purchased items', error);
  return { deleted: data as number };
});
