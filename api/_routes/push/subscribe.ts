import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { env } from '../../_lib/env.js';
import { pushSubscribeBody } from '../../_lib/schemas.js';

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

  const body = parseBody(req, pushSubscribeBody);
  const userAgent = req.headers['user-agent'] ?? null;

  // A Fire shell schedules its reminders on the device: it only registers itself (no push keys, no VAPID needed).
  const row =
    'channel' in body
      ? { endpoint: `local:${body.deviceId}`, p256dh: 'local', auth: 'local', channel: 'local' }
      : { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, channel: 'web-push' };
  if (row.channel === 'web-push') assertVapidConfigured();

  const { data, error } = await client
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, ...row, user_agent: userAgent },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single();

  if (error) throw new ApiError('INTERNAL', 'Failed to save subscription', error);
  return { id: data.id };
});
