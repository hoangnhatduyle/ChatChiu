import { describe, expect, it } from 'vitest'
import {
  MEAL_TYPES,
  monthWeeks,
  sharesFavourite,
  shiftMonth,
  slotKey,
  weekDates,
  weekStartMonday,
} from './meal-calendar.js'
import { recipeMatchesQuery } from './recipe-match.js'

// 2026-11-16 is a Monday.
describe('F-MP-01 the week', () => {
  it('starts on Monday and has seven days', () => {
    expect(weekStartMonday('2026-11-18')).toBe('2026-11-16')
    expect(weekStartMonday('2026-11-22')).toBe('2026-11-16') // Sunday belongs to the week before
    expect(weekStartMonday('2026-11-16')).toBe('2026-11-16')
    expect(weekDates('2026-11-18')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
  })
  it('has breakfast, lunch and dinner in that order', () => {
    expect(MEAL_TYPES).toEqual(['breakfast', 'lunch', 'dinner'])
  })
})

describe('F-MP-02 the month', () => {
  it('lists whole Monday-first weeks that cover the month', () => {
    const weeks = monthWeeks('2026-11-18')
    expect(weeks[0]![0]).toBe('2026-10-26') // 1 Nov 2026 is a Sunday
    expect(weeks.at(-1)!.at(-1)).toBe('2026-12-06') // 30 Nov is a Monday
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat()).toContain('2026-11-30')
  })
  it('reads years below 100 as themselves, not as 19xx', () => {
    expect(shiftMonth('0050-03-15', 0)).toBe('0050-03-01')
    expect(shiftMonth('0050-03-15', 1)).toBe('0050-04-01')
  })
  it('moves a month at a time, to the first day', () => {
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01')
  })
})

describe('F-MP-07 a favourite belongs to the meal', () => {
  it('matches by recipe when the target has one, else by name ignoring case and spaces', () => {
    expect(sharesFavourite({ recipeId: 3, mealName: 'A' }, { recipeId: 3, mealName: 'B' })).toBe(
      true,
    )
    expect(sharesFavourite({ recipeId: 3, mealName: 'A' }, { recipeId: 4, mealName: 'A' })).toBe(
      false,
    )
    expect(
      sharesFavourite(
        { recipeId: null, mealName: 'Pho bo' },
        { recipeId: 9, mealName: ' pho BO ' },
      ),
    ).toBe(true)
    expect(
      sharesFavourite({ recipeId: null, mealName: 'Pho' }, { recipeId: null, mealName: 'Pho bo' }),
    ).toBe(false)
  })
})

describe('F-MP-04 slots', () => {
  it('has one key per date and meal type', () => {
    expect(slotKey('2026-11-16', 'lunch')).toBe('2026-11-16|lunch')
  })
})

describe('F-MP-09 recipe search', () => {
  const omelette = { name: 'Omelette', ingredients: 'eggs, milk, Cheese' }
  it('finds by name or by ingredient, ignoring case and accents', () => {
    expect(recipeMatchesQuery(omelette, 'omel')).toBe(true)
    expect(recipeMatchesQuery(omelette, 'CHEESE')).toBe(true)
    expect(recipeMatchesQuery({ name: 'Phở', ingredients: 'bún' }, 'pho')).toBe(true)
    expect(recipeMatchesQuery(omelette, 'bread')).toBe(false)
    expect(recipeMatchesQuery(omelette, '  ')).toBe(true)
  })
})
