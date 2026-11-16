import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { env } from '../../_lib/env.js';
import { pushSubscribe as subscribeSchema } from '../../_lib/schemas.js';

function assertVapidConfigured(): void {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    throw new ApiError(
      'INTERNAL',
      'Push notifications are not configured on this deployment',
    );
  }
}

export default authedHandler(async ({ user, client }, req) => {
  const method = assertMethod(req, ['POST', 'DELETE']);

  if (method === 'DELETE') {
    const endpoint = String(req.query.endpoint ?? '').trim();
    if (!endpoint) {
      throw new ApiError('BAD_REQUEST', 'endpoint query parameter is required');
    }
    const { error } = await client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
    if (error) throw new ApiError('INTERNAL', 'Failed to remove subscription', error);
    return { deleted: true };
  }

  assertVapidConfigured();
  const body = parseBody(req, subscribeSchema);
  const userAgent = req.headers['user-agent'] ?? null;

  const { data, error } = await client
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: userAgent,
      },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single();

  if (error) throw new ApiError('INTERNAL', 'Failed to save subscription', error);
  return { id: data.id };
});
