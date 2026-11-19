import { z } from 'zod'
import {
  dateString,
  idList,
  idSchema,
  optionalText,
  MAX_AMOUNT,
  positiveNumber,
  requiredText,
} from './fields.js'

/** Largest receipt / multi-select batch accepted by the bulk routes. */
export const BULK_MAX = 200

export const inventoryItemCreate = z.object({
  name: requiredText(200),
  categoryId: idSchema,
  quantity: positiveNumber,
  unit: requiredText(30),
  purchaseDate: dateString.optional().nullable(),
  expirationDate: dateString,
  locationId: idSchema.optional().nullable(),
  /** Per unit (CS-PER-UNIT-PRICE). */
  price: positiveNumber.optional().nullable(),
  notes: optionalText(1000),
  notificationEnabled: z.boolean().optional().default(true),
  notificationDaysBefore: z.coerce.number().int().min(0).max(365).optional().default(3),
  barcode: optionalText(120),
  initialQuantity: positiveNumber.optional().nullable(),
  currentQuantity: positiveNumber.optional().nullable(),
  /** Percent of the full amount (CS-PERCENT-LOW-STOCK). */
  lowStockThreshold: positiveNumber.optional().nullable(),
})
export type InventoryItemCreate = z.infer<typeof inventoryItemCreate>

// Zod 4 applies .default() inside optional fields, so a plain .partial() would inject
// notificationEnabled/notificationDaysBefore on every PATCH. Override them without defaults
// so fields absent from the body stay absent (CS-ZOD4-NO-UPDATE-DEFAULTS, AC-API-03).
export const inventoryItemUpdate = inventoryItemCreate.partial().extend({
  notificationEnabled: z.boolean().optional(),
  notificationDaysBefore: z.coerce.number().int().min(0).max(365).optional(),
})
export type InventoryItemUpdate = z.infer<typeof inventoryItemUpdate>

/** POST /api/inventory/:id/usage — same body as the old app. */
export const usageLog = z.object({
  amountUsed: positiveNumber,
  currentQuantity: positiveNumber,
  notes: optionalText(500),
})
export type UsageLog = z.infer<typeof usageLog>

/** POST /api/inventory/:id/usage-undo */
export const usageUndo = z.object({ usageId: idSchema })
export type UsageUndo = z.infer<typeof usageUndo>

/** POST /api/inventory/:id/restock — refills the same item (D13). No defaults. */
export { MAX_AMOUNT }

export const restock = z.object({
  quantity: z.coerce.number().positive().max(MAX_AMOUNT),
  expirationDate: dateString.optional(),
  /** Total paid; stored as totalPrice / quantity per unit. */
  totalPrice: positiveNumber.max(MAX_AMOUNT).optional().nullable(),
})
export type Restock = z.infer<typeof restock>

/** POST /api/inventory/bulk */
export const bulkCreate = z.object({ items: z.array(inventoryItemCreate).min(1).max(BULK_MAX) })
export type BulkCreate = z.infer<typeof bulkCreate>

/** DELETE /api/inventory/bulk */
export const bulkDelete = z.object({ ids: idList(BULK_MAX) })
export type BulkDelete = z.infer<typeof bulkDelete>

/** Row shape returned by the inventory routes (camelCase of inventory_items). */
export interface InventoryItem {
  id: number
  userId: string
  name: string
  categoryId: number
  quantity: number
  unit: string
  purchaseDate: string | null
  expirationDate: string
  locationId: number | null
  price: number | null
  notes: string | null
  notificationEnabled: boolean
  notificationDaysBefore: number
  barcode: string | null
  initialQuantity: number | null
  currentQuantity: number | null
  usageNotes: string | null
  lowStockThreshold: number | null
  lastNotifiedAt: string | null
  /** Added by migration 0016; absent on rows read before it is applied. */
  lowStockNotifiedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface UsageEntry {
  id: number
  itemId: number
  userId: string
  amountUsed: number
  remainingAmount: number
  notes: string | null
  recordedAt: string
}

/** POST /usage response: the old usage row plus additive fields (AC-API-07). */
export interface UsageLogResult extends UsageEntry {
  crossedLowStock: boolean
  item: InventoryItem
}
