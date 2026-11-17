import { perUnitPrice } from '@chatchiu/domain';
import { authedHandler, assertMethod } from '../../../_lib/handler.js';
import { ApiError } from '../../../_lib/errors.js';
import { pathId } from '../../../_lib/params.js';
import { parseBody } from '../../../_lib/validation.js';
import { restock } from '../../../_lib/schemas.js';
import { toCamel } from '../../../_lib/mappers.js';

// POST /api/inventory/:id/restock { quantity, expirationDate?, totalPrice? }
// "I bought this again" (D13): the same item becomes the new full amount, with the
// total price stored per unit, and the low-stock marker cleared so it can alert
// again (AC-API-08, AC-DATA-10). One UPDATE, so it is atomic; no second item.
export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['POST']);
  const id = pathId(req, 'id', 'item');
  const body = parseBody(req, restock);

  const patch: Record<string, unknown> = {
    quantity: body.quantity,
    initial_quantity: body.quantity,
    current_quantity: body.quantity,
    low_stock_notified_at: null,
  };
  if (body.expirationDate) patch.expiration_date = body.expirationDate;
  if (body.totalPrice != null) patch.price = perUnitPrice(body.totalPrice, body.quantity);

  const { data, error } = await client
    .from('inventory_items')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Failed to restock item', error);
  if (!data) throw new ApiError('NOT_FOUND', 'Item not found');
  return toCamel(data);
});
