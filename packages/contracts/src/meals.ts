import { z } from 'zod'
import { dateString, idSchema, optionalText, requiredText } from './fields.js'

export const mealType = z.enum(['breakfast', 'lunch', 'dinner'])
export type MealType = z.infer<typeof mealType>

export const mealPlanCreate = z.object({
  planDate: dateString,
  mealType,
  mealName: requiredText(200),
  recipeId: idSchema.optional().nullable(),
  isFavorite: z.boolean().optional().default(false),
  notes: optionalText(500),
})
export type MealPlanCreate = z.infer<typeof mealPlanCreate>

// No default on isFavorite for updates (see inventoryItemUpdate).
export const mealPlanUpdate = mealPlanCreate.partial().extend({
  isFavorite: z.boolean().optional(),
})
export type MealPlanUpdate = z.infer<typeof mealPlanUpdate>

/** GET /api/meal-plans?from&to */
export const mealPlanListQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
})

export interface MealPlan {
  id: number
  userId: string
  planDate: string
  mealType: MealType
  mealName: string
  recipeId: number | null
  isFavorite: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}
