import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { wasteCreate } from '../../_lib/schemas.js';
import { toCamel, toSnake } from '../../_lib/mappers.js';

export default authedHandler(async ({ user, client }, req) => {
  const method = assertMethod(req, ['GET', 'POST']);

  if (method === 'GET') {
    // Joins the category name (AC-API-14); null when the entry has none or the
    // category is not visible to her. The embedded object is not passed through.
    const { data, error } = await client
      .from('wasted_items')
      .select('*, categories(name)')
      .order('wasted_date', { ascending: false });
    if (error) throw new ApiError('INTERNAL', 'Failed to load waste log', error);
    return (data ?? []).map(({ categories, ...row }) => ({
      ...toCamel(row),
      categoryName: (categories as { name?: string } | null)?.name ?? null,
    }));
  }

  // POST (ad-hoc waste entry not tied to an inventory item)
  const body = parseBody(req, wasteCreate);
  const row = toSnake({ ...body, userId: user.id });
  const { data, error } = await client
    .from('wasted_items')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new ApiError('INTERNAL', 'Failed to record waste', error);
  return toCamel(data);
});
