import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { deliverPush } from '../../_lib/push.js';
import { env } from '../../_lib/env.js';
import { parseBody } from '../../_lib/validation.js';
import { pushTest } from '../../_lib/schemas.js';

export default authedHandler(async ({ user, client }, req) => {
  assertMethod(req, ['POST']);
  // The device that pressed the button names itself, so only that device gets the test; without it, all of hers do.
  const { endpoint } = req.body == null ? ({} as { endpoint?: string }) : parseBody(req, pushTest);

  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    throw new ApiError(
      'INTERNAL',
      'Push notifications are not configured on this deployment',
    );
  }

  let query = client
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id)
    // A Fire shell notifies itself: only web-push devices can be sent a push.
    .eq('channel', 'web-push');
  if (endpoint) query = query.eq('endpoint', endpoint);
  const { data: subs, error } = await query;

  if (error) throw new ApiError('INTERNAL', 'Failed to load subscriptions', error);
  if (!subs?.length) {
    throw new ApiError('BAD_REQUEST', 'No push subscription found. Enable notifications first.');
  }

  // The send job's delivery, so a subscription the push service reports gone (404/410) is removed here too
  // (7.0.32a) instead of failing every test from then on. The per-user write budget already limits POSTs.
  const { sent, failures } = await deliverPush(subs, {
    title: 'Test from Chắt Chiu',
    body: 'Push notifications are working.',
    url: '/settings',
    tag: 'push-test',
  });
  const gone = failures.filter((f) => f.gone).map((f) => f.endpoint);
  if (gone.length > 0) {
    const removed = await client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .in('endpoint', gone);
    if (removed.error) console.warn('[push/test] could not remove dead subscriptions', removed.error.code);
  }

  if (!sent) {
    throw new ApiError(
      gone.length === subs.length ? 'BAD_REQUEST' : 'INTERNAL',
      gone.length === subs.length
        ? 'This device is no longer registered with its push service. Turn notifications on again.'
        : 'Could not deliver test notification',
    );
  }

  return { sent };
});
