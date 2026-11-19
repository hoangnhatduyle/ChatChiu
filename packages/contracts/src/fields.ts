import { z } from 'zod'

// Shared field constraints, moved unchanged from api/_lib/validation.ts so the
// web app and the API validate the same way (AR-CONTRACTS).

export const idSchema = z.coerce.number().int().positive()

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

/** Upper bound for amounts and prices, so numeric maths cannot overflow (the new restock schema always had it). */
export const MAX_AMOUNT = 1e9

/** Old name kept for parity: it accepts 0 (non-negative), not only > 0; now with an upper bound (7.0.13e). */
export const positiveNumber = z.coerce.number().nonnegative().max(MAX_AMOUNT)

export const optionalText = (max = 500) => z.string().trim().max(max).optional().nullable()

export const requiredText = (max = 200) => z.string().trim().min(1).max(max)

export const idList = (max: number) => z.array(idSchema).min(1).max(max)
