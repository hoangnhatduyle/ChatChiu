import { z } from 'zod'
import { dateString, optionalText, requiredText } from './fields.js'

export const expirationSuggestRequest = z.object({
  itemName: requiredText(200),
  categoryName: optionalText(100),
  storageLocation: optionalText(100),
  purchaseDate: dateString.optional(),
})
export type ExpirationSuggestRequest = z.infer<typeof expirationSuggestRequest>

export interface ExpirationSuggestion {
  days: number
  note: string
}

export const receiptScanRequest = z.object({
  imagePath: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[a-z0-9-]+\/(items|receipts)\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i, {
      message: 'imagePath must be <userId>/<scope>/<uuid>.<ext> within the bucket',
    }),
})
export type ReceiptScanRequest = z.infer<typeof receiptScanRequest>

// Uploads only feed receipt scanning (and the hidden item photos), so the
// signing schema lives with the AI contracts (decided in step 2.1).
export const signUploadRequest = z.object({
  scope: z.enum(['items', 'receipts']),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  ext: z.enum(['jpg', 'jpeg', 'png', 'webp']),
})
export type SignUploadRequest = z.infer<typeof signUploadRequest>

/** One line read off a receipt (POST /api/ai/receipt-scan); every hint is a guess to confirm. */
export interface ReceiptScanLine {
  name: string
  quantity?: number
  unit?: string
  price?: number
  categoryHint?: string
  shelfLifeDaysHint?: number
}

export interface ReceiptScanResult {
  items: ReceiptScanLine[]
}
