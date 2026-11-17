import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { bulkCreate, bulkDelete } from '../../_lib/schemas.js';
import { toCamelList, toSnake } from '../../_lib/mappers.js';

// POST   /api/inventory/bulk { items } — create many in one transaction (create_items)
// DELETE /api/inventory/bulk { ids }   — delete many of hers in one statement (delete_items)
// AC-API-09 / AC-API-10, AC-DATA-17.
export default authedHandler(async ({ client }, req) => {
  const method = assertMethod(req, ['POST', 'DELETE']);

  if (method === 'POST') {
    const { items } = parseBody(req, bulkCreate);
    const { data, error } = await client.rpc('create_items', {
      p_items: items.map((item) => toSnake(item)),
    });
    if (error) {
      if (error.code === '23503') throw new ApiError('BAD_REQUEST', 'Unknown category or location');
      if (error.code === '22023' || error.code === '23502') {
        throw new ApiError('BAD_REQUEST', 'Invalid items', error);
      }
      throw new ApiError('INTERNAL', 'Failed to create items', error);
    }
    return toCamelList((data ?? []) as Record<string, unknown>[]);
  }

  const { ids } = parseBody(req, bulkDelete);
  const { data, error } = await client.rpc('delete_items', { p_ids: ids });
  if (error) throw new ApiError('INTERNAL', 'Failed to delete items', error);
  return { deleted: data as number };
});
