// Phase 0 step 0.6 spike: push "subscribe -> send -> receive" test for /diagnostics.
//
// Deliberately separate from the ported router (api/handler.ts):
// - It does not import _lib/env.ts, so it works without Supabase or OpenAI configuration.
// - It never touches the database: the browser sends its subscription, and we push straight back.
// - It uses a throwaway VAPID pair (DIAG_VAPID_*), never the production keys.
// - It is off (404) unless DIAGNOSTICS_ENABLED=true, and only pushes to known push services (no SSRF).
// Delete this file once the spike is recorded (roadmap 0.6).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { z } from 'zod';

const MAX_DELAY_SECONDS = 30;

// Hosts of the push services browsers actually use. Anything else is reported back, not contacted.
const PUSH_HOST_PATTERNS: readonly RegExp[] = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && PUSH_HOST_PATTERNS.some((re) => re.test(url.hostname));
}

const sendSchema = z.object({
  subscription: z.object({
    endpoint: z.string().max(2000),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
    }),
  }),
  delaySeconds: z.number().int().min(0).max(MAX_DELAY_SECONDS).default(0),
});

function diagnosticsConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  if (process.env.DIAGNOSTICS_ENABLED !== 'true') return null;
  const publicKey = process.env.DIAG_VAPID_PUBLIC_KEY ?? '';
  const privateKey = process.env.DIAG_VAPID_PRIVATE_KEY ?? '';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.DIAG_VAPID_SUBJECT || 'mailto:admin@example.com' };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function diagnostics(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const config = diagnosticsConfig();
  if (!config) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Diagnostics are disabled' } });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ data: { publicKey: config.publicKey } });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Allowed methods: GET, POST' } });
    return;
  }

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request body' } });
    return;
  }
  const { subscription, delaySeconds } = parsed.data;
  const host = (() => {
    try {
      return new URL(subscription.endpoint).hostname;
    } catch {
      return 'invalid-url';
    }
  })();

  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    res.status(422).json({
      error: { code: 'UNKNOWN_PUSH_SERVICE', message: `Push service host not on the allowlist: ${host}` },
    });
    return;
  }

  await sleep(delaySeconds * 1000);
  const payload = JSON.stringify({
    title: 'Chắt Chiu diagnostics',
    body: `Test push delivered (sent ${delaySeconds}s after you tapped).`,
    tag: 'diagnostics',
    url: '/diagnostics',
  });

  try {
    const result = await webpush.sendNotification(subscription, payload, {
      vapidDetails: config,
      TTL: 300,
      urgency: 'high',
    });
    res.status(200).json({ data: { host, pushServiceStatus: result.statusCode } });
  } catch (err) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    res.status(200).json({
      data: {
        host,
        pushServiceStatus: e.statusCode ?? null,
        pushServiceError: String(e.body || e.message || 'unknown error').slice(0, 300),
      },
    });
  }
}
