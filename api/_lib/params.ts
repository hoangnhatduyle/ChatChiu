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

/**
 * A case-insensitive, exact-name pattern for `ilike`: trimmed, with `%`, `_` and `\` escaped so a meal named
 * "50%" or "pho_bo" matches only itself (7.0.30b). The client mirror (`sharesFavourite`) trims and lower-cases.
 */
export function ilikeExact(name: string): string {
  return name.trim().replace(/[\\%_]/g, '\\$&');
}
