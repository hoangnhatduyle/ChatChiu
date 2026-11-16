import { z } from 'zod'
import { idSchema, positiveNumber, requiredText } from './fields.js'

export const wasteCreate = z.object({
  itemName: requiredText(200),
  categoryId: idSchema.optional().nullable(),
  quantity: positiveNumber,
  unit: requiredText(30),
  /** Per unit. */
  price: positiveNumber.optional().nullable(),
  wastedDate: z.string().datetime().optional(),
})
export type WasteCreate = z.infer<typeof wasteCreate>

/** POST /api/waste/from-item (mark_item_wasted). */
export const wasteFromItem = z.object({
  itemId: idSchema,
  quantity: positiveNumber.optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
})
export type WasteFromItem = z.infer<typeof wasteFromItem>

export interface WasteEntry {
  id: number
  userId: string
  itemName: string
  categoryId: number | null
  /** Joined by GET /api/waste (AC-API-14); null when the entry has no category. */
  categoryName?: string | null
  quantity: number
  unit: string
  price: number | null
  wastedDate: string
}
