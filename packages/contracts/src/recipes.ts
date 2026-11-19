import { z } from 'zod'
import { optionalText, requiredText } from './fields.js'

export const recipeCreate = z.object({
  name: requiredText(200),
  /** Comma-separated. */
  ingredients: requiredText(5000),
  prepTime: optionalText(50),
  servings: z.coerce.number().int().positive().max(1000).optional().nullable(),
  instructions: optionalText(10000),
})
export type RecipeCreate = z.infer<typeof recipeCreate>

export const recipeUpdate = recipeCreate.partial()
export type RecipeUpdate = z.infer<typeof recipeUpdate>

export interface Recipe {
  id: number
  userId: string
  name: string
  ingredients: string
  prepTime: string | null
  servings: number | null
  instructions: string | null
  createdAt: string
  updatedAt: string
}

/** GET /api/recipes/suggestions row (AC-API-15, F-MP-12). Names match the old Recipe model. */
export interface RecipeSuggestion extends Recipe {
  matchCount: number
  matchingItems: string[]
}
