import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { pathId } from '../../_lib/params.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { categoryUpdate } from '../../_lib/schemas.js';
import { toCamel, toSnake } from '../../_lib/mappers.js';

export default authedHandler(async ({ client }, req) => {
  const method = assertMethod(req, ['PATCH', 'DELETE']);
  const id = pathId(req, 'id', 'category');

  if (method === 'PATCH') {
    const body = parseBody(req, categoryUpdate);
    if (Object.keys(body).length === 0) {
      throw new ApiError('BAD_REQUEST', 'No fields to update');
    }
    const { data, error } = await client
      .from('categories')
      .update(toSnake(body))
      .eq('id', id)
      .eq('is_system', false)
      .select('*')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new ApiError('CONFLICT', 'A category with that name already exists');
      }
      throw new ApiError('INTERNAL', 'Failed to update category', error);
    }
    if (!data) throw new ApiError('NOT_FOUND', 'Category not found or not editable');
    return toCamel(data);
  }

  const { error, count } = await client
    .from('categories')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('is_system', false);
  if (error) {
    // Still used by items (FK, AC-DATA-14): a readable 409 instead of a 500.
    if (error.code === '23503') {
      const used = await client
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id);
      const n = used.count ?? 0;
      throw new ApiError(
        'CONFLICT',
        `This category is still used by ${n} item${n === 1 ? '' : 's'}. Move them to another category first.`,
      );
    }
    throw new ApiError('INTERNAL', 'Failed to delete category', error);
  }
  if (!count) throw new ApiError('NOT_FOUND', 'Category not found or not deletable');
  return { deleted: true };
});
