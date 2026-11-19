import { authedHandler, assertMethod } from '../../../_lib/handler.js';
import { pathId } from '../../../_lib/params.js';
import { ApiError } from '../../../_lib/errors.js';
import { parseBody } from '../../../_lib/validation.js';
import { toCamel, toCamelList } from '../../../_lib/mappers.js';
import { usageLog as schema } from '../../../_lib/schemas.js';

// GET  /api/inventory/:id/usage - history, newest first (unchanged)
// POST /api/inventory/:id/usage { amountUsed, currentQuantity, notes? } - same body
// as the old app. Now one atomic call (log_item_usage): the history row and the
// new current_quantity are written together, amount_used is computed from the
// locked row, and the response keeps the old usage-row fields plus
// crossedLowStock and the updated item (AC-API-07; additive, NC-API-NO-BREAK-OLD).
export default authedHandler(async ({ client }, req) => {
  const method = assertMethod(req, ['GET', 'POST']);
  const itemId = pathId(req, 'id', 'item');

  if (method === 'GET') {
    const { data, error } = await client
      .from('usage_history')
      .select('*')
      .eq('item_id', itemId)
      .order('recorded_at', { ascending: false });
    if (error) throw new ApiError('INTERNAL', 'Failed to load usage history', error);
    return toCamelList(data ?? []);
  }

  const body = parseBody(req, schema);
  const { data, error } = await client.rpc('log_item_usage', {
    p_item_id: itemId,
    p_new_current: body.currentQuantity,
    p_notes: body.notes ?? null,
  });
  if (error) {
    if (error.code === 'P0002') throw new ApiError('NOT_FOUND', 'Item not found');
    if (error.code === '22023') {
      throw new ApiError('BAD_REQUEST', 'A usage can only lower the amount left (use edit or restock to raise it)', error);
    }
    throw new ApiError('INTERNAL', 'Failed to log usage', error);
  }
  const result = data as {
    usage: Record<string, unknown>;
    item: Record<string, unknown>;
    crossed_low_stock: boolean;
  };
  return {
    ...toCamel(result.usage),
    crossedLowStock: result.crossed_low_stock,
    item: toCamel(result.item),
  };
});
