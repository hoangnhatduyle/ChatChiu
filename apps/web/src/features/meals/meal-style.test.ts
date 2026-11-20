// UI refresh: the colours of the meal plan.
import { MEAL_TONE, RECIPE_TONES, recipeInitial, recipeTone } from './meal-style'

describe('meal-style', () => {
  it('each meal type has its own tint', () => {
    expect(new Set(Object.values(MEAL_TONE)).size).toBe(3)
  })

  it('a recipe always gets the same tint, whatever the case or spacing', () => {
    expect(recipeTone('Pho bo')).toBe(recipeTone('  PHO BO '))
    expect(RECIPE_TONES).toContain(recipeTone('Omelette'))
  })

  it('different names spread over the tints', () => {
    const names = ['Pho', 'Omelette', 'Toast', 'Bun cha', 'Salad', 'Soup', 'Curry', 'Rice']
    expect(new Set(names.map(recipeTone)).size).toBeGreaterThan(2)
  })

  it('the initial is the first letter in capitals, with Vietnamese letters kept whole', () => {
    expect(recipeInitial('omelette')).toBe('O')
    expect(recipeInitial('  ếch xào')).toBe('Ế')
    expect(recipeInitial('')).toBe('?')
  })
})
