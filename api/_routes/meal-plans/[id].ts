import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { ilikeExact, pathId } from '../../_lib/params.js';
import { parseBody } from '../../_lib/validation.js';
import { mealPlanUpdate } from '../../_lib/schemas.js';
import { toCamel, toSnake } from '../../_lib/mappers.js';

export default authedHandler(async ({ client }, req) => {
  const method = assertMethod(req, ['PATCH', 'DELETE']);
  const id = pathId(req, 'id', 'meal plan');

  if (method === 'PATCH') {
    const body = parseBody(req, mealPlanUpdate);
    if (Object.keys(body).length === 0) {
      throw new ApiError('BAD_REQUEST', 'No fields to update');
    }
    // A name typed here goes into her recipe library too, as on create (F-MP-05, AC-API-13; 7.0.30a).
    if (!body.recipeId && body.mealName) {
      const ensured = await client.rpc('ensure_recipe', { p_name: body.mealName });
      if (ensured.error) {
        throw new ApiError('INTERNAL', 'Failed to add the meal to recipes', ensured.error);
      }
    }
    const { data, error } = await client
      .from('meal_plans')
      .update(toSnake(body))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError('CONFLICT', 'A meal is already planned for that slot');
      }
      throw new ApiError('INTERNAL', 'Failed to update meal plan', error);
    }
    if (!data) throw new ApiError('NOT_FOUND', 'Meal plan not found');

    // Favorite status belongs to the meal, not the calendar slot: keep every
    // other plan entry for the same recipe (or free-text name) in sync so the
    // favorites list stays a single, deduplicated entry per meal.
    if (body.isFavorite !== undefined) {
      let siblingQuery = client
        .from('meal_plans')
        .update({ is_favorite: body.isFavorite })
        .neq('id', id);
      siblingQuery = data.recipe_id
        ? siblingQuery.eq('recipe_id', data.recipe_id)
        : siblingQuery.ilike('meal_name', ilikeExact(data.meal_name));
      await siblingQuery;
    }

    return toCamel(data);
  }

  const { error, count } = await client
    .from('meal_plans')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new ApiError('INTERNAL', 'Failed to delete meal plan', error);
  if (!count) throw new ApiError('NOT_FOUND', 'Meal plan not found');
  return { deleted: true };
});
