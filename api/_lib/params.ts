import type { VercelRequest } from '@vercel/node';
import { ApiError } from './errors.js';

/** A strictly numeric, safe, positive path id ("12abc" and 2^53+ are rejected). */
export function pathId(req: VercelRequest, key: string, label: string): number {
  const raw = String(req.query[key] ?? '');
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ApiError('BAD_REQUEST', `Invalid ${label} id`);
  return id;
}
