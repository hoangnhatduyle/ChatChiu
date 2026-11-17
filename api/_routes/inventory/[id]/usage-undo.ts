import { authedHandler, assertMethod } from '../../../_lib/handler.js';
import { ApiError } from '../../../_lib/errors.js';
import { pathId } from '../../../_lib/params.js';
import { parseBody } from '../../../_lib/validation.js';
import { usageUndo } from '../../../_lib/schemas.js';
import { toCamel } from '../../../_lib/mappers.js';

// POST /api/inventory/:id/usage-undo { usageId } — deletes that history row and
// restores the quantity (undo_item_usage, AC-API-07). The entry must belong to
// this item; a second undo of the same id is 404 (UNDONE → LOGGED is impossible).
export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['POST']);
  const itemId = pathId(req, 'id', 'item');
  const { usageId } = parseBody(req, usageUndo);

  const entry = await client
    .from('usage_history')
    .select('id')
    .eq('id', usageId)
    .eq('item_id', itemId)
    .maybeSingle();
  if (entry.error) throw new ApiError('INTERNAL', 'Failed to load usage entry', entry.error);
  if (!entry.data) throw new ApiError('NOT_FOUND', 'Usage entry not found');

  const { data, error } = await client.rpc('undo_item_usage', { p_usage_id: usageId });
  if (error) {
    if (error.code === 'P0002') throw new ApiError('NOT_FOUND', 'Usage entry not found');
    if (error.code === '55000') {
      throw new ApiError(
        'CONFLICT',
        'This usage can no longer be undone because the item changed since',
      );
    }
    throw new ApiError('INTERNAL', 'Failed to undo usage', error);
  }
  return toCamel(data as Record<string, unknown>);
});
