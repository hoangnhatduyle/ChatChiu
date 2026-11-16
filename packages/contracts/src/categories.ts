import { z } from 'zod'
import { optionalText, requiredText } from './fields.js'

export const categoryCreate = z.object({
  name: requiredText(100),
  icon: optionalText(60),
  color: optionalText(30),
})
export type CategoryCreate = z.infer<typeof categoryCreate>

export const categoryUpdate = categoryCreate.partial()
export type CategoryUpdate = z.infer<typeof categoryUpdate>

/** Production rows are user-owned; never assume seeded ids, names or isSystem (AR-NO-SEED-ASSUMPTIONS). */
export interface Category {
  id: number
  name: string
  icon: string | null
  color: string | null
  userId: string | null
  isSystem: boolean
}
