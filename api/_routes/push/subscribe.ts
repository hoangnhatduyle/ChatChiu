import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { env } from '../../_lib/env.js';
import { MAX_PUSH_SUBSCRIPTIONS } from '@chatchiu/contracts';
import { pushSubscribeBody } from '../../_lib/schemas.js';

const CAP_MESSAGE = `At most ${MAX_PUSH_SUBSCRIPTIONS} devices can receive reminders. Turn reminders off on one you no longer use.`;

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
    const raw = String(req.query.endpoint ?? '').trim();
    // Stored in its normalised spelling (see below); a local:<id> endpoint is not a URL and stays as it is.
    const endpoint = URL.canParse(raw) && !raw.startsWith('local:') ? new URL(raw).href : raw;
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
      : {
          // The normalised URL (lower-case host, no explicit default port): what the database CHECK and the send job see.
          endpoint: new URL(body.endpoint).href,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          channel: 'web-push',
        };
  if (row.channel === 'web-push') assertVapidConfigured();

  // A device that is already registered is only refreshed; a new one must fit under the cap (a user could otherwise
  // register thousands and make the shared hourly send job spend its whole run on them).
  const { data: mine, error: countError } = await client
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id);
  if (countError) throw new ApiError('INTERNAL', 'Failed to save subscription', countError);
  const known = mine?.some((s) => s.endpoint === row.endpoint) ?? false;
  if (!known && (mine?.length ?? 0) >= MAX_PUSH_SUBSCRIPTIONS) {
    throw new ApiError('CONFLICT', CAP_MESSAGE);
  }

  const { data, error } = await client
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, ...row, user_agent: userAgent },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single();

  if (error) {
    // The database enforces the same rules as this route (hardening, supabase/post-cutover): the cap (54000) can be
    // reached by a race between two requests, and the endpoint check (23514) by a spelling this route let through.
    if (error.code === '54000') throw new ApiError('CONFLICT', CAP_MESSAGE);
    if (error.code === '23514') throw new ApiError('BAD_REQUEST', 'Unknown push service');
    throw new ApiError('INTERNAL', 'Failed to save subscription', error);
  }
  return { id: data.id };
});
