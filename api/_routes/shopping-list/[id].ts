import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { pathId } from '../../_lib/params.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { shoppingItemUpdate } from '../../_lib/schemas.js';
import { toCamel, toSnake } from '../../_lib/mappers.js';

export default authedHandler(async ({ client }, req) => {
  const method = assertMethod(req, ['PATCH', 'DELETE']);
  const id = pathId(req, 'id', 'shopping item');

  if (method === 'PATCH') {
    const body = parseBody(req, shoppingItemUpdate);
    if (Object.keys(body).length === 0) {
      throw new ApiError('BAD_REQUEST', 'No fields to update');
    }
    const { data, error } = await client
      .from('shopping_list')
      .update(toSnake(body))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', 'Failed to update shopping item', error);
    if (!data) throw new ApiError('NOT_FOUND', 'Shopping item not found');
    return toCamel(data);
  }

  // DELETE
  const { error, count } = await client
    .from('shopping_list')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new ApiError('INTERNAL', 'Failed to delete shopping item', error);
  if (!count) throw new ApiError('NOT_FOUND', 'Shopping item not found');
  return { deleted: true };
});
