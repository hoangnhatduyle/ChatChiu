// Everything the meal plan changes (SPEC-MP-001), on the data hooks only. A slot holds one meal: adding
// to a taken slot, from the dialog or by dropping a copy, answers "conflict" so the screen can ask
// Replace or Cancel (F-MP-04, NC-MP-NO-UNHANDLED-409). A favourite belongs to the meal (F-MP-07).
import type { MealPlan, MealPlanUpdate } from '@chatchiu/contracts'
import { sharesFavourite, slotKey, type MealSlotType } from '@chatchiu/domain'
import { useQueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../../core/errors'
import { useToast } from '../../core/toast-context'
import { mealWrites, setMealFavorite } from '../../data/meals'
import { queryKeys } from '../../data/query'
import { newTempId } from '../../data/resource'
import { useHeldWrite } from '../../data/undoable'
import { startWrite, useWrite, type WriteHandle } from '../../data/write'

export interface MealDraft {
  planDate: string
  mealType: MealSlotType
  mealName: string
  recipeId: number | null
  notes: string | null
  isFavorite: boolean
}

export type AddOutcome =
  /** The write was accepted (and, once this settles, saved). */
  | { status: 'started' }
  /** The slot has a meal: ask Replace (change `existingId`) or Cancel. */
  | { status: 'conflict'; existingId: number; draft: MealDraft }
  | { status: 'same-slot' }
  /** Refused: the failed-write toast already says so. */
  | { status: 'failed' }

const MEALS_KEY = ['meal-plans'] as const
const NOT_STARTED = 'That change could not start. Try again in a moment.'

export function useMealActions(plans: readonly MealPlan[]) {
  const client = useQueryClient()
  const toasts = useToast()
  const update = useWrite(mealWrites.update)
  const favourite = useWrite(setMealFavorite)
  const holdRemove = useHeldWrite(mealWrites.remove)

  /** A refusal before the write started (the row is still being created) has no failed-write toast: say it here. */
  const reportRefusal = <T>(handle: WriteHandle<T>): WriteHandle<T> => {
    void handle.result.then((result) => {
      if (result.status === 'failed' && result.blocked) {
        const message = result.error instanceof Error ? result.error.message : NOT_STARTED
        toasts.show({ message, tone: 'error' })
      }
    })
    return handle
  }

  const takenBy = (date: string, type: MealSlotType, ignoreId?: number) =>
    plans.find((p) => p.id !== ignoreId && slotKey(p.planDate, p.mealType) === slotKey(date, type))

  /** A favourite elsewhere makes this meal a favourite from the start; the API does the same. */
  const startsAsFavourite = (draft: MealDraft, ignoreId?: number) =>
    draft.isFavorite ||
    plans.some((p) => p.id !== ignoreId && p.isFavorite && sharesFavourite(draft, p))

  /** Creates the plan. A 409 that names the meal in the way comes back as a conflict, not as a toast. */
  async function createPlan(draft: MealDraft): Promise<AddOutcome> {
    const handle = startWrite(
      client,
      mealWrites.create,
      { tempId: newTempId(), body: { ...draft, isFavorite: startsAsFavourite(draft) } },
      { handlesConflict: true },
    )
    const result = await handle.result
    if (result.status === 'saved') {
      // The API adds a typed name to the recipe library (ensure_recipe, F-MP-05): read it again.
      if (draft.recipeId === null) void client.invalidateQueries({ queryKey: queryKeys.recipes })
      return { status: 'started' }
    }
    if (result.status === 'failed' && result.error instanceof ApiClientError) {
      const { existingId } = result.error
      if (existingId !== undefined) {
        // The screen did not know the slot was taken (another device): it was rolled back, so this
        // write must not be retried; the screen asks Replace or Cancel instead.
        handle.discard()
        return { status: 'conflict', existingId, draft }
      }
    }
    return { status: 'failed' }
  }

  async function add(draft: MealDraft): Promise<AddOutcome> {
    const taken = takenBy(draft.planDate, draft.mealType)
    if (taken) return { status: 'conflict', existingId: taken.id, draft }
    return createPlan(draft)
  }

  /** Dropping a meal on a slot copies it there (F-MP-08); the original stays. */
  function copyTo(source: MealPlan, date: string, type: MealSlotType): Promise<AddOutcome> {
    if (source.planDate === date && source.mealType === type)
      return Promise.resolve({ status: 'same-slot' })
    return add({
      planDate: date,
      mealType: type,
      mealName: source.mealName,
      recipeId: source.recipeId,
      notes: source.notes,
      isFavorite: source.isFavorite,
    })
  }

  /** Replace: the meal in the slot becomes the new one (a change, so the slot is never empty). */
  async function replace(existingId: number, draft: MealDraft): Promise<AddOutcome> {
    const patch: MealPlanUpdate = {
      mealName: draft.mealName,
      recipeId: draft.recipeId,
      notes: draft.notes,
      isFavorite: startsAsFavourite(draft, existingId),
    }
    const result = await reportRefusal(update({ id: existingId, patch })).result
    if (result.status !== 'saved') {
      // The meal being replaced was deleted elsewhere: what she wanted is the new meal in that slot.
      if (
        result.status === 'failed' &&
        result.error instanceof ApiClientError &&
        result.error.code === 'NOT_FOUND'
      )
        return createPlan(draft)
      return { status: 'failed' }
    }
    // The screen did not know that meal (it came from the server's 409): read the plan again to show it.
    if (!plans.some((p) => p.id === existingId))
      void client.invalidateQueries({ queryKey: MEALS_KEY })
    return { status: 'started' }
  }

  const change = (id: number, patch: MealPlanUpdate) => reportRefusal(update({ id, patch }))
  const setFavourite = (plan: MealPlan, value: boolean) =>
    reportRefusal(favourite({ id: plan.id, value }))
  const remove = (plan: MealPlan) => holdRemove({ id: plan.id }, `${plan.mealName} removed`)

  return { add, copyTo, replace, change, setFavourite, remove }
}
