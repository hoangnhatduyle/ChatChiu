import { describe, expect, it } from 'vitest'
import { mealSummary } from './meal-summary.js'

type Plan = {
  id: number
  planDate: string
  mealType: 'breakfast' | 'lunch' | 'dinner'
  mealName: string
  recipeId: number | null
  isFavorite: boolean
}
let nextId = 1
const plan = (
  planDate: string,
  mealType: Plan['mealType'],
  mealName: string,
  extra: Partial<Plan> = {},
): Plan => ({
  id: nextId++,
  planDate,
  mealType,
  mealName,
  recipeId: null,
  isFavorite: false,
  ...extra,
})

// Ported from OLD/src/app/services/meal-plan.service.ts getSummary() lines 48–169.
// 2026-11-16 is a Monday.
const today = '2026-11-16'

describe('meal summary (F-MP-10: same numbers as the old getSummary)', () => {
  const plans = [
    plan('2026-10-30', 'dinner', 'Pho bo'),
    plan('2026-11-14', 'lunch', 'Pho bo', { isFavorite: true }),
    plan('2026-11-15', 'dinner', 'pho bo ', { isFavorite: true }),
    plan('2026-11-15', 'breakfast', 'Toast'),
    plan('2026-11-16', 'breakfast', 'Omelette', { recipeId: 7, isFavorite: true }),
    plan('2026-11-18', 'lunch', 'Salad'),
  ]

  it('without a range: counts from the first plan to today', () => {
    const s = mealSummary(plans, { today })
    // 2026-10-30 → 2026-11-16 is 18 days → 54 slots
    expect(s.totalSlots).toBe(54)
    expect(s.totalMeals).toBe(6)
    expect(s.filledSlots).toBe(6)
    expect(s.emptySlots).toBe(48)
    expect(s.completionRate).toBeCloseTo(6 / 54, 10)
    expect(s.averageMealsPerDay).toBeCloseTo(6 / 18, 10)
    expect(s.byMealType).toEqual({ breakfast: 2, lunch: 2, dinner: 2 })
    expect(s.breakdownByType).toEqual(s.byMealType)
    expect(s.daysWithPlans).toBe(5)
  })

  it('top 5 meals by exact name, favourites collapsed per meal (newest kept)', () => {
    const s = mealSummary(plans, { today })
    expect(s.mostFrequentMeals[0]).toEqual({ name: 'Pho bo', mealName: 'Pho bo', count: 2 })
    expect(s.mostFrequentMeals).toHaveLength(5)
    expect(s.favoriteMeals.map((p) => [p.planDate, p.mealName])).toEqual([
      ['2026-11-16', 'Omelette'],
      ['2026-11-15', 'pho bo '],
    ])
  })

  it('this week (Mon–Sun), streak back from today, recent 10 and the monthly breakdown', () => {
    const s = mealSummary(plans, { today })
    expect(s.thisWeekCount).toBe(2)
    expect(s.currentStreak).toBe(3)
    expect(s.recentMeals[0]?.planDate).toBe('2026-11-18')
    expect(s.recentMeals).toHaveLength(6)
    expect(s.monthlyBreakdown).toEqual([
      { month: '2026-10', count: 1, percentage: (1 / 6) * 100 },
      { month: '2026-11', count: 5, percentage: (5 / 6) * 100 },
    ])
  })

  it('streak counts back from yesterday when nothing is planned today', () => {
    const s = mealSummary([plan('2026-11-14', 'lunch', 'A'), plan('2026-11-15', 'lunch', 'B')], {
      today,
    })
    expect(s.currentStreak).toBe(2)
  })

  it('on a Sunday the week still starts on the Monday before', () => {
    const s = mealSummary([plan('2026-11-16', 'lunch', 'A'), plan('2026-11-23', 'lunch', 'B')], {
      today: '2026-11-22',
    })
    expect(s.thisWeekCount).toBe(1)
  })

  it('streak runs across a year boundary', () => {
    const s = mealSummary([plan('2025-12-31', 'lunch', 'A'), plan('2026-01-01', 'lunch', 'B')], {
      today: '2026-01-01',
    })
    expect(s.currentStreak).toBe(2)
  })

  it('equal dates keep their input order (consistent comparator)', () => {
    const a = plan('2026-11-15', 'lunch', 'First')
    const b = plan('2026-11-15', 'dinner', 'Second')
    expect(mealSummary([a, b], { today }).recentMeals.map((p) => p.mealName)).toEqual([
      'First',
      'Second',
    ])
  })

  it('ignores a meal type the database should never hold instead of producing NaN', () => {
    const odd = { ...plan('2026-11-15', 'lunch', 'X'), mealType: 'brunch' as 'lunch' }
    expect(mealSummary([odd], { today }).byMealType).toEqual({ breakfast: 0, lunch: 0, dinner: 0 })
  })

  it('with a from/to range: slots cover that range', () => {
    const s = mealSummary([plan('2026-11-16', 'lunch', 'A')], {
      today,
      from: '2026-11-16',
      to: '2026-11-22',
    })
    expect(s.totalSlots).toBe(21)
    expect(s.completionRate).toBeCloseTo(1 / 21, 10)
  })

  it('no plans: one-day range, zero rates, no division by zero', () => {
    const s = mealSummary([], { today })
    expect(s.totalSlots).toBe(3)
    expect(s.completionRate).toBe(0)
    expect(s.monthlyBreakdown).toEqual([])
    expect(s.currentStreak).toBe(0)
  })
})
