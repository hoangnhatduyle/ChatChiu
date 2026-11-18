// Meal plan (step 4.4): a date range read, and writes. Adding a meal to a slot that is taken answers
// 409 with the existing row's id (AC-API-13); the write fails and the screen offers to edit that one.
import type { MealPlan, MealPlanCreate, MealPlanUpdate } from '@chatchiu/contracts'
import { sharesFavourite } from '@chatchiu/domain'
import type { QueryClient } from '@tanstack/react-query'
import { api } from '../core/api-client'
import { queryKeys, useApiQuery } from './query'
import { defineResource, tempGuard, type ListStore } from './resource'
import { defineWrite } from './write'

/** Every cached range holds its own list; a write edits all the ranges it could appear in. */
const MEALS_PREFIX = ['meal-plans'] as const
const MEALS_PATH = '/api/meal-plans'
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
  write: (client: QueryClient, next, options) => {
    if (options?.cancelFetch !== false)
      void client.cancelQueries({ queryKey: MEALS_PREFIX }, { revert: false })
    const byId = new Map(next.map((row) => [row.id, row]))
    for (const [key, rows] of client.getQueriesData<MealPlan[]>({ queryKey: MEALS_PREFIX })) {
      if (!rows) continue
      // A meal moved out of this range by another device leaves it; one moved in is added below.
      const kept = rows
        .flatMap((row) => (byId.has(row.id) ? [byId.get(row.id)!] : []))
        .filter((row) => inRange(key, row.planDate))
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
  path: MEALS_PATH,
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
  useApiQuery<MealPlan[]>(queryKeys.meals(from, to), MEALS_PATH, { from, to })

/**
 * Favourite belongs to the meal (F-MP-07): the API sets it on every plan of the same meal, so the cache
 * does the same before the answer. `before` lists each changed plan's old value for the rollback.
 */
export const setMealFavorite = defineWrite<
  { id: number; value: boolean },
  MealPlan,
  { before: Array<[number, boolean]> }
>({
  key: 'meals/favourite',
  refetchOnFailure: MEALS_PREFIX,
  label: 'Change a favourite',
  guard: ({ id }) => tempGuard(id),
  scope: ({ id }) => `meals:${id}`,
  request: ({ id, value }, requestId) =>
    api.patch<MealPlan>(
      `${MEALS_PATH}/${id}`,
      { isFavorite: value },
      { idempotencyKey: requestId },
    ),
  apply: (client, { id, value }) => {
    const rows = mealStore.read(client)
    const target = rows.find((r) => r.id === id)
    if (!target) return { before: [] }
    const changed = rows.filter((r) => r.id === id || sharesFavourite(target, r))
    const ids = new Set(changed.map((r) => r.id))
    mealStore.write(
      client,
      rows.map((r) => (ids.has(r.id) ? { ...r, isFavorite: value } : r)),
    )
    return { before: changed.map((r): [number, boolean] => [r.id, r.isFavorite]) }
  },
  reconcile: (client, saved) =>
    mealStore.write(
      client,
      mealStore.read(client).map((r) => (r.id === saved.id ? saved : r)),
    ),
  rollback: (client, { before }) => {
    const old = new Map(before)
    mealStore.write(
      client,
      mealStore.read(client).map((r) => (old.has(r.id) ? { ...r, isFavorite: old.get(r.id)! } : r)),
    )
  },
})
