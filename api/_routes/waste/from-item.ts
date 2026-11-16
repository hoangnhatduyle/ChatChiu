import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { toCamel } from '../../_lib/mappers.js';
import { wasteFromItem as schema } from '../../_lib/schemas.js';

// POST /api/waste/from-item
// Body: { itemId, quantity?, unit? }
// Atomically (a) inserts a wasted_items row from the inventory item and
// (b) deletes the inventory item. See supabase/migrations/0004_waste_function.sql.
// Fixes audit finding H16.

export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['POST']);
  const body = parseBody(req, schema);

  const { data, error } = await client.rpc('mark_item_wasted', {
    p_item_id: body.itemId,
    p_quantity: body.quantity ?? null,
    p_unit: body.unit ?? null,
  });
  if (error) {
    if (error.code === 'P0002') throw new ApiError('NOT_FOUND', 'Item not found');
    throw new ApiError('INTERNAL', 'Failed to mark item as wasted', error);
  }
  return toCamel(data as Record<string, unknown>);
});
