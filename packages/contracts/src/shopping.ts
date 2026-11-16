import { z } from 'zod'
import { idList, idSchema, optionalText, requiredText } from './fields.js'

/** Largest list a single clear-purchased request may carry. */
export const CLEAR_PURCHASED_MAX = 500

export const shoppingItemCreate = z.object({
  name: requiredText(200),
  /** Free text, e.g. "10" or "2 bags". */
  quantity: optionalText(60),
  notes: optionalText(500),
  categoryId: idSchema.optional().nullable(),
})
export type ShoppingItemCreate = z.infer<typeof shoppingItemCreate>

export const shoppingItemUpdate = shoppingItemCreate.partial().extend({
  isPurchased: z.boolean().optional(),
})
export type ShoppingItemUpdate = z.infer<typeof shoppingItemUpdate>

/** POST /api/shopping-list/clear-purchased — only the ids purchased when she tapped. */
export const clearPurchased = z.object({ ids: idList(CLEAR_PURCHASED_MAX) })
export type ClearPurchased = z.infer<typeof clearPurchased>

export interface ShoppingItem {
  id: number
  userId: string
  name: string
  quantity: string | null
  notes: string | null
  categoryId: number | null
  isPurchased: boolean
  createdAt: string
}
