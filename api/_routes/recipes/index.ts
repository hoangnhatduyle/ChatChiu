import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { recipeCreate } from '../../_lib/schemas.js';
import { toCamel, toCamelList, toSnake } from '../../_lib/mappers.js';

export default authedHandler(async ({ user, client }, req) => {
  const method = assertMethod(req, ['GET', 'POST']);

  if (method === 'GET') {
    const { data, error } = await client
      .from('recipes')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw new ApiError('INTERNAL', 'Failed to load recipes', error);
    return toCamelList(data ?? []);
  }

  const body = parseBody(req, recipeCreate);
  // A plain insert: the old upsert targeted (user_id, name), which matches no
  // constraint (the unique index is (user_id, lower(name))), so every create
  // failed with 42P10. A duplicate name, in any case, is now a readable 409.
  const { data, error } = await client
    .from('recipes')
    .insert(toSnake({ ...body, userId: user.id }))
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new ApiError('CONFLICT', 'A recipe with that name already exists');
    }
    throw new ApiError('INTERNAL', 'Failed to save recipe', error);
  }
  return toCamel(data);
});
