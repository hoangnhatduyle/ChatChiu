import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody, parseQuery } from '../../_lib/validation.js';
import { mealPlanCreate, mealPlanListQuery as listQuery } from '../../_lib/schemas.js';
import { toCamel, toCamelList, toSnake } from '../../_lib/mappers.js';

export default authedHandler(async ({ user, client }, req) => {
  const method = assertMethod(req, ['GET', 'POST']);

  if (method === 'GET') {
    const { from, to } = parseQuery(req, listQuery);
    let q = client
      .from('meal_plans')
      .select('*')
      .order('plan_date', { ascending: true })
      .order('meal_type', { ascending: true });
    if (from) q = q.gte('plan_date', from);
    if (to) q = q.lte('plan_date', to);
    const { data, error } = await q;
    if (error) throw new ApiError('INTERNAL', 'Failed to load meal plans', error);
    return toCamelList(data ?? []);
  }

  // POST - on conflict (user_id, plan_date, meal_type) the unique constraint
  // (migration 0001) returns 23505, which we surface as a CONFLICT. The UI
  // can then prompt the user to overwrite (PATCH on the existing id).
  const body = parseBody(req, mealPlanCreate);

  // Favorite status belongs to the meal, not the calendar slot: if this
  // recipe (or free-text name) is already favorited elsewhere, the new plan
  // inherits it instead of starting unfavorited again.
  let isFavorite = body.isFavorite ?? false;
  if (!isFavorite) {
    let favoriteQuery = client
      .from('meal_plans')
      .select('id')
      .eq('is_favorite', true)
      .limit(1);
    favoriteQuery = body.recipeId
      ? favoriteQuery.eq('recipe_id', body.recipeId)
      : favoriteQuery.ilike('meal_name', body.mealName);
    const { data: existingFavorite } = await favoriteQuery.maybeSingle();
    if (existingFavorite) isFavorite = true;
  }

  // A typed meal name goes into her recipe library first (ensure_recipe: no
  // duplicate in any case, F-MP-05 / AC-API-13). Errors are not swallowed. This
  // replaces the old best-effort upsert, which matched no constraint (42P10).
  if (!body.recipeId && body.mealName) {
    const ensured = await client.rpc('ensure_recipe', { p_name: body.mealName });
    if (ensured.error) {
      throw new ApiError('INTERNAL', 'Failed to add the meal to recipes', ensured.error);
    }
  }

  const row = toSnake({ ...body, userId: user.id, isFavorite });

  const insert = await client.from('meal_plans').insert(row).select('*').single();
  if (insert.error) {
    if ((insert.error as { code?: string }).code === '23505') {
      // The slot is taken: return its id so the UI can offer Replace (AC-API-12).
      const existing = await client
        .from('meal_plans')
        .select('id')
        .eq('plan_date', body.planDate)
        .eq('meal_type', body.mealType)
        .maybeSingle();
      throw new ApiError(
        'CONFLICT',
        `A meal is already planned for ${body.planDate} ${body.mealType}`,
        undefined,
        { existingId: existing.data?.id as number | undefined },
      );
    }
    throw new ApiError('INTERNAL', 'Failed to add meal plan', insert.error);
  }

  return toCamel(insert.data);
});
