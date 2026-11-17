import type { Recipe } from '@chatchiu/contracts';
import { USE_SOON_DAYS, addDays, suggestRecipes } from '@chatchiu/domain';
import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { parseQuery } from '../../_lib/validation.js';
import { preferencesQuery } from '../../_lib/schemas.js';
import { toCamelList } from '../../_lib/mappers.js';
import { userClock } from '../../_lib/clock.js';
import { fetchAll } from '../../_lib/paging.js';

interface CandidateRow {
  name: string;
  expiration_date: string;
  quantity: number;
  current_quantity: number | null;
}

// GET /api/recipes/suggestions[?tz=] - her recipes ranked by how many items expiring
// within 3 days they use (packages/domain recipe-match; no AI, AC-API-15). Only the
// use-soon window is read from the database; the domain applies the exact rule.
export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['GET']);
  const { tz } = parseQuery(req, preferencesQuery);
  const { today } = await userClock(client, tz);
  const [recipes, items] = await Promise.all([
    fetchAll<Record<string, unknown>>(
      (from, to) => client.from('recipes').select('*').order('name').order('id').range(from, to),
      'recipes',
    ),
    fetchAll<CandidateRow>(
      (from, to) =>
        client
          .from('inventory_items')
          .select('name, expiration_date, quantity, current_quantity')
          .gte('expiration_date', today)
          .lte('expiration_date', addDays(today, USE_SOON_DAYS))
          .order('id')
          .range(from, to),
      'items',
    ),
  ]);
  const matchable = items.map((i) => ({
    name: String(i.name),
    expirationDate: String(i.expiration_date),
    quantity: Number(i.quantity),
    currentQuantity: i.current_quantity == null ? null : Number(i.current_quantity),
  }));
  return suggestRecipes(toCamelList(recipes) as unknown as Recipe[], matchable, today);
});
