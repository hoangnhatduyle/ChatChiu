// Meal plan calendar helpers (SPEC-MP-001): the Monday-first week, the month grid, one slot per
// date and meal type, and "a favourite belongs to the meal". Pure: dates are YYYY-MM-DD strings.
import { addDays } from './dates.js'

export type MealSlotType = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_TYPES: readonly MealSlotType[] = ['breakfast', 'lunch', 'dinner']

const DAYS_IN_WEEK = 7
const MONDAY_OFFSET_FROM_SUNDAY = -6

export function weekStartMonday(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, weekday === 0 ? MONDAY_OFFSET_FROM_SUNDAY : 1 - weekday)
}

/** The seven dates of the week holding `date`, Monday first. */
export function weekDates(date: string): string[] {
  const start = weekStartMonday(date)
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(start, i))
}

/** First day of the month `delta` months from the one holding `date`. */
export function shiftMonth(date: string, delta: number): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7)) - 1 + delta
  // Not Date.UTC(): it reads years 0 to 99 as 1900 to 1999.
  const shifted = new Date(0)
  shifted.setUTCFullYear(year, month, 1)
  return shifted.toISOString().slice(0, 10)
}

/** Whole Monday-first weeks that cover the month holding `date`. */
export function monthWeeks(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`
  const next = shiftMonth(first, 1)
  const weeks: string[][] = []
  for (let start = weekStartMonday(first); start < next; start = addDays(start, DAYS_IN_WEEK)) {
    weeks.push(weekDates(start))
  }
  return weeks
}

export const slotKey = (date: string, type: MealSlotType): string => `${date}|${type}`

interface MealIdentity {
  recipeId?: number | null
  mealName: string
}
const normalName = (name: string): string => name.trim().toLowerCase()

/**
 * Whether `candidate` is the same meal as `target` for favourites (the API's rule, so the screen can
 * show the result before the answer): by recipe when the target has one, else by name.
 */
export function sharesFavourite(target: MealIdentity, candidate: MealIdentity): boolean {
  if (target.recipeId != null) return candidate.recipeId === target.recipeId
  return normalName(candidate.mealName) === normalName(target.mealName)
}
