import type { ZodSchema } from 'zod';
import type { VercelRequest } from '@vercel/node';
import { ApiError } from './errors.js';

export function parseBody<T>(req: VercelRequest, schema: ZodSchema<T>): T {
  if (req.body == null) {
    throw new ApiError('BAD_REQUEST', 'Request body is required');
  }
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError('BAD_REQUEST', 'Invalid request body', result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T>(req: VercelRequest, schema: ZodSchema<T>): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new ApiError('BAD_REQUEST', 'Invalid query parameters', result.error.flatten());
  }
  return result.data;
}

// Shared field constraints moved to packages/contracts (step 2.1); re-exported
// here so existing route imports keep working.
export {
  dateString,
  idSchema,
  optionalText,
  positiveNumber,
  requiredText,
} from '@chatchiu/contracts';
