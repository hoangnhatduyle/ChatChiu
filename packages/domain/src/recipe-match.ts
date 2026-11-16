// Recipe suggestions from items that need using up, no AI (F-MP-12, F-QP-09, AC-API-15).
// An item matches a recipe when a word of its name equals a word of an ingredient,
// ignoring case, accents and simple plurals.
import { USE_SOON_DAYS, daysLeft } from './expiry.js'
import { getRemainingQuantity } from './quantity.js'

const MIN_WORD_LENGTH = 3

export interface RecipeLike {
  name: string
  ingredients: string
}

export interface MatchableItem {
  name: string
  expirationDate: string
  quantity: number
  currentQuantity?: number | null
}

export type Suggestion<R> = R & { matchCount: number; matchingItems: string[] }

export function parseIngredients(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 4 && /(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function words(text: string): Set<string> {
  const plain = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
  return new Set(
    plain
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= MIN_WORD_LENGTH)
      .map(singular),
  )
}

/** Names of the given items that the recipe uses, in input order. */
export function matchRecipe(recipe: RecipeLike, itemNames: readonly string[]): string[] {
  const ingredientWords = words(recipe.ingredients)
  return itemNames.filter((name) => [...words(name)].some((w) => ingredientWords.has(w)))
}

/** Items that are not expired, not used up, and expire within the use-soon window. */
export function needsUsingSoon(item: MatchableItem, today: string): boolean {
  const days = daysLeft(item.expirationDate, today)
  return days >= 0 && days <= USE_SOON_DAYS && getRemainingQuantity(item) > 0
}

/** Recipes ranked by how many use-soon items they use, then by name; recipes with no match are left out. */
export function suggestRecipes<R extends RecipeLike>(
  recipes: readonly R[],
  items: readonly MatchableItem[],
  today: string,
): Array<Suggestion<R>> {
  const names = items.filter((i) => needsUsingSoon(i, today)).map((i) => i.name)
  return recipes
    .map((recipe) => {
      const matchingItems = matchRecipe(recipe, names)
      return { ...recipe, matchCount: matchingItems.length, matchingItems }
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name))
}

export function recipesUsingItem<R extends RecipeLike>(
  recipes: readonly R[],
  itemName: string,
): R[] {
  return recipes.filter((r) => matchRecipe(r, [itemName]).length > 0)
}
