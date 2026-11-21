import { describe, expect, it } from 'vitest'
import {
  matchRecipe,
  parseIngredients,
  recipeStockMatch,
  recipesUsingItem,
  suggestRecipes,
} from './recipe-match.js'

const today = '2026-11-16'
const omelette = { id: 1, name: 'Omelette', ingredients: 'eggs, milk, cheese' }
const toast = { id: 2, name: 'Toast', ingredients: 'bread, butter' }
const item = (name: string, expirationDate: string, currentQuantity = 1) => ({
  name,
  expirationDate,
  quantity: 1,
  currentQuantity,
})

describe('recipe matching (F-MP-12, AC-API-15)', () => {
  it('parses comma-separated ingredients, dropping blanks', () => {
    expect(parseIngredients(' eggs, milk ,, cheese ')).toEqual(['eggs', 'milk', 'cheese'])
    expect(parseIngredients('')).toEqual([])
  })

  it('matches item names to ingredient words, ignoring case, plurals and accents', () => {
    expect(matchRecipe(omelette, ['Egg', 'Whole Milk', 'Rice'])).toEqual(['Egg', 'Whole Milk'])
    expect(matchRecipe({ name: 'Phở', ingredients: 'bánh phở, hành' }, ['Banh pho'])).toEqual([
      'Banh pho',
    ])
  })

  it('F-MP-12: Omelette first with 2 matches, Toast not suggested', () => {
    const items = [
      item('Eggs', '2026-11-17'),
      item('Milk', '2026-11-19'),
      item('Bread', '2026-12-30'),
    ]
    const result = suggestRecipes([toast, omelette], items, today)
    expect(result).toEqual([
      expect.objectContaining({ id: 1, matchCount: 2, matchingItems: ['Eggs', 'Milk'] }),
    ])
  })

  it('only counts items expiring within 3 days that are not expired or used up', () => {
    const items = [
      item('Eggs', '2026-11-15'),
      item('Milk', '2026-11-17', 0),
      item('Cheese', '2026-11-18'),
    ]
    expect(suggestRecipes([omelette], items, today)).toEqual([
      expect.objectContaining({ matchCount: 1, matchingItems: ['Cheese'] }),
    ])
  })

  it('ranks by match count, then by name', () => {
    const quiche = { id: 3, name: 'Quiche', ingredients: 'eggs, cheese' }
    const custard = { id: 4, name: 'Custard', ingredients: 'eggs, milk' }
    const items = [item('Eggs', today), item('Milk', today), item('Cheese', today)]
    expect(suggestRecipes([quiche, custard, omelette], items, today).map((r) => r.name)).toEqual([
      'Omelette',
      'Custard',
      'Quiche',
    ])
  })

  it('handles -ies / -ches / -oes plurals', () => {
    const pie = { name: 'Pie', ingredients: 'berries, peaches, tomatoes' }
    expect(matchRecipe(pie, ['Berry', 'Peach', 'Tomato'])).toEqual(['Berry', 'Peach', 'Tomato'])
  })

  it('F-QP-09: recipes that use one item', () => {
    expect(recipesUsingItem([omelette, toast], 'Butter').map((r) => r.name)).toEqual(['Toast'])
  })
})

describe('recipe stock match (Meals recipe cards)', () => {
  const stock = (name: string, expirationDate = '2026-12-31', currentQuantity = 1) =>
    item(name, expirationDate, currentQuantity)

  it('splits the ingredients into what is in stock and what is missing', () => {
    const match = recipeStockMatch(omelette, [stock('Eggs'), stock('Milk')], today)
    expect(match).toEqual({ total: 3, have: ['eggs', 'milk'], missing: ['cheese'] })
  })

  it('does not count items that are expired or used up', () => {
    const match = recipeStockMatch(
      omelette,
      [stock('Eggs', '2026-11-15'), stock('Milk', '2026-12-31', 0), stock('Cheese', today)],
      today,
    )
    expect(match.have).toEqual(['cheese'])
    expect(match.missing).toEqual(['eggs', 'milk'])
  })

  it('matches a short Vietnamese ingredient to the same short item name', () => {
    const match = recipeStockMatch({ ingredients: 'gà, hành' }, [stock('Gà')], today)
    expect(match).toEqual({ total: 2, have: ['gà'], missing: ['hành'] })
  })

  it('has total 0 when the recipe lists no ingredients', () => {
    expect(recipeStockMatch({ ingredients: ' , ' }, [stock('Eggs')], today)).toEqual({
      total: 0,
      have: [],
      missing: [],
    })
  })
})
