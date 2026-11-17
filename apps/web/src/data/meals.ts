// Meal plan (step 4.4): a date range read, and writes. Adding a meal to a slot that is taken answers
// 409 with the existing row's id (AC-API-13); the write fails and the screen offers to edit that one.
import type { MealPlan, MealPlanCreate, MealPlanUpdate } from '@chatchiu/contracts'
import { queryKeys, useApiQuery } from './query'
import { defineResource, type ListStore } from './resource'
import type { QueryClient } from '@tanstack/react-query'

/** Every cached range holds its own list; a write edits all the ranges it could appear in. */
const MEALS_PREFIX = ['meal-plans'] as const
const inRange = (key: readonly unknown[], date: string): boolean => {
  const [, from, to] = key as [string, string | null, string | null]
  return (from === null || date >= from) && (to === null || date <= to)
}

export const mealStore: ListStore<MealPlan> = {
  queryKey: MEALS_PREFIX,
  read: (client) => {
    const seen = new Map<number, MealPlan>()
    for (const [, rows] of client.getQueriesData<MealPlan[]>({ queryKey: MEALS_PREFIX })) {
      for (const row of rows ?? []) seen.set(row.id, row)
    }
    return [...seen.values()]
  },
  write: (client: QueryClient, next) => {
    void client.cancelQueries({ queryKey: MEALS_PREFIX }, { revert: false })
    const byId = new Map(next.map((row) => [row.id, row]))
    for (const [key, rows] of client.getQueriesData<MealPlan[]>({ queryKey: MEALS_PREFIX })) {
      if (!rows) continue
      const kept = rows.flatMap((row) => (byId.has(row.id) ? [byId.get(row.id)!] : []))
      const added = next.filter(
        (row) => !rows.some((r) => r.id === row.id) && inRange(key, row.planDate),
      )
      client.setQueryData(key, [...kept, ...added])
    }
  },
}

export const mealWrites = defineResource<MealPlan, MealPlanCreate, MealPlanUpdate>({
  name: 'meals',
  noun: 'a meal',
  path: '/api/meal-plans',
  store: mealStore,
  draft: (body, id) => {
    const now = new Date().toISOString()
    return {
      id,
      userId: '',
      planDate: body.planDate,
      mealType: body.mealType,
      mealName: body.mealName,
      recipeId: body.recipeId ?? null,
      isFavorite: body.isFavorite ?? false,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }
  },
})

export const useMealsQuery = (from?: string, to?: string) =>
  useApiQuery<MealPlan[]>(queryKeys.meals(from, to), '/api/meal-plans', { from, to })
