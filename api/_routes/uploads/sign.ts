import { randomUUID } from 'node:crypto';
import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseBody } from '../../_lib/validation.js';
import { signUploadRequest } from '../../_lib/schemas.js';
import { env } from '../../_lib/env.js';

// POST /api/uploads/sign
// Body: { scope: 'items'|'receipts', contentType, ext }
// Response: { path, token, signedUrl, expiresIn }
//
// Generates a one-shot upload URL for Supabase Storage that the browser
// uses to PUT the image directly. The path is server-chosen
// (<userId>/<scope>/<uuid>.<ext>) so the client cannot collide or escape its
// own folder; the storage RLS policy enforces the same invariant.

export default authedHandler(async ({ user, client }, req) => {
  assertMethod(req, ['POST']);
  const body = parseBody(req, signUploadRequest);

  // A user's folder grows without bound otherwise (a receipt that is never read stays): cap what one user keeps per
  // scope. Listing the capped page is enough to tell whether the cap is reached (7.0.41f).
  const cap = env.maxStoredUploads;
  const stored = await client.storage
    .from('inventory-images')
    .list(`${user.id}/${body.scope}`, { limit: cap });
  if (stored.error) throw new ApiError('INTERNAL', 'Failed to check stored photos', stored.error);
  if (stored.data.length >= cap) {
    throw new ApiError(
      'BAD_REQUEST',
      'You have reached the limit of stored photos. Delete some items or receipts first.',
    );
  }

  const path = `${user.id}/${body.scope}/${randomUUID()}.${body.ext}`;

  const { data, error } = await client.storage
    .from('inventory-images')
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new ApiError('INTERNAL', 'Failed to sign upload URL', error);
  }

  return {
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    contentType: body.contentType,
    expiresIn: 60, // seconds; Supabase default for signed upload URLs
  };
}, { idempotent: false }); // the signed URL and token are a short-lived credential: never stored or replayed

