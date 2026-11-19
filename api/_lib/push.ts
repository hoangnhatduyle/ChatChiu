import webpush from 'web-push';
import { isAllowedPushEndpoint } from '@chatchiu/contracts';
import { env } from './env.js';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPush(
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<void> {
  // The one function that POSTs to a stored endpoint: a user can write push_subscriptions straight through PostgREST,
  // so the host is checked here too (SSRF), not only when a subscription is saved.
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    throw new Error('Endpoint is not a known push service');
  }
  ensureConfigured();
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload),
  );
}

export async function sendPushToMany(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const sub of subscriptions) {
    try {
      await sendPush(sub, payload);
      sent++;
    } catch (err) {
      failed++;
      console.warn('[push] delivery failed', hostOf(sub.endpoint), err instanceof Error ? err.name : 'error');
    }
  }
  return { sent, failed };
}

export interface DeliveryFailure {
  endpoint: string;
  statusCode: number | null;
  /** Fixed text only: upstream bodies are never stored or returned (SSRF review). */
  message: string;
  /** 404 / 410, or not a push service: the subscription should be deleted. */
  gone: boolean;
}

/** One push service call may take at most this long (step 2.4 review). */
const SEND_TIMEOUT_MS = 5000;

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return '(invalid url)';
  }
}

// Send to each subscription and report every failure with its status code, so
// the send job can delete dead subscriptions and record the rest (AC-API-20,
// NC-NT-NO-SILENT-FAILURE). Endpoints that are not a known push service are
// never contacted (SSRF guard). Logs carry only the host: an endpoint URL is a
// capability. sendPush / sendPushToMany above are kept as they were.
export async function deliverPush(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<{ sent: number; failures: DeliveryFailure[] }> {
  ensureConfigured();
  let sent = 0;
  const failures: DeliveryFailure[] = [];
  const body = JSON.stringify(payload);
  for (const sub of subscriptions) {
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      failures.push({ endpoint: sub.endpoint, statusCode: null, message: 'Endpoint is not a known push service', gone: true });
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { timeout: SEND_TIMEOUT_MS },
      );
      sent++;
    } catch (err) {
      const raw = (err as { statusCode?: unknown }).statusCode;
      const statusCode = typeof raw === 'number' ? raw : null;
      failures.push({
        endpoint: sub.endpoint,
        statusCode,
        message: statusCode == null ? 'Push service unreachable' : `Push service answered ${statusCode}`,
        gone: statusCode === 404 || statusCode === 410,
      });
      console.warn('[push] delivery failed', hostOf(sub.endpoint), statusCode);
    }
  }
  return { sent, failures };
}
