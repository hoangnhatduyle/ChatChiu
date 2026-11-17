// Recipes (step 4.4): the list, the "what can I cook" suggestions, and recipe writes. Suggestions
// depend on the pantry, so they are a plain read that is not changed by a write.
import type { Recipe, RecipeCreate, RecipeSuggestion, RecipeUpdate } from '@chatchiu/contracts'
import { queryKeys, useApiQuery } from './query'
import { defineResource, queryListStore } from './resource'

export const recipeWrites = defineResource<Recipe, RecipeCreate, RecipeUpdate>({
  name: 'recipes',
  noun: 'a recipe',
  path: '/api/recipes',
  store: queryListStore<Recipe>(queryKeys.recipes),
  draft: (body, id) => {
    const now = new Date().toISOString()
    return {
      id,
      userId: '',
      name: body.name,
      ingredients: body.ingredients,
      prepTime: body.prepTime ?? null,
      servings: body.servings ?? null,
      instructions: body.instructions ?? null,
      createdAt: now,
      updatedAt: now,
    }
  },
})

export const useRecipesQuery = () => useApiQuery<Recipe[]>(queryKeys.recipes, '/api/recipes')
export const useRecipeSuggestionsQuery = () =>
  useApiQuery<RecipeSuggestion[]>(queryKeys.recipeSuggestions, '/api/recipes/suggestions')
