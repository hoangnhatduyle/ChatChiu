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

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()

export interface RecipeStockMatch {
  /** How many ingredients the recipe lists. */
  total: number
  /** Ingredients, as written, that an item in stock covers. */
  have: string[]
  /** Ingredients, as written, that nothing in stock covers. */
  missing: string[]
}

/** Folded tokens of any length: a short Vietnamese word such as "gà" is a whole ingredient, not noise. */
const tokens = (text: string): string[] => fold(text).split(/[^a-z0-9]+/).filter(Boolean)

/** An item still in the kitchen: some left, and not past its date (today is the last good day). */
function isInStock(item: MatchableItem, today: string): boolean {
  return daysLeft(item.expirationDate, today) >= 0 && getRemainingQuantity(item) > 0
}

/**
 * Which of a recipe's ingredients the kitchen covers, for the "3 of 5 in stock" chip. An ingredient is covered
 * when a word of an item in stock equals one of its words (the rule `matchRecipe` uses); an ingredient made only
 * of short words is covered when the item name holds that same short word.
 */
export function recipeStockMatch(
  recipe: Pick<RecipeLike, 'ingredients'>,
  items: readonly MatchableItem[],
  today: string,
): RecipeStockMatch {
  const stocked = items.filter((i) => isInStock(i, today))
  const itemWords = stocked.map((i) => words(i.name))
  const itemTokens = stocked.map((i) => new Set(tokens(i.name)))
  const have: string[] = []
  const missing: string[] = []
  for (const ingredient of parseIngredients(recipe.ingredients)) {
    const own = [...words(ingredient)]
    const covered =
      own.length > 0
        ? itemWords.some((set) => own.some((w) => set.has(w)))
        : itemTokens.some((set) => tokens(ingredient).some((t) => set.has(t)))
    ;(covered ? have : missing).push(ingredient)
  }
  return { total: have.length + missing.length, have, missing }
}

/** Recipe library search (F-MP-09): the text is in the name or in an ingredient; blank matches all. */
export function recipeMatchesQuery(recipe: RecipeLike, query: string): boolean {
  const q = fold(query.trim())
  return q === '' || fold(recipe.name).includes(q) || fold(recipe.ingredients).includes(q)
}
