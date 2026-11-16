// Meal plan summary. Ported from getSummary() in
// OLD/src/app/services/meal-plan.service.ts (lines 48–169) as a pure function:
// "today" and the optional from/to range are passed in, plans are not fetched.
import { addDays, daysBetween } from './dates.js'

export type MealTypeKey = 'breakfast' | 'lunch' | 'dinner'

export interface SummaryPlan {
  planDate: string
  mealType: MealTypeKey
  mealName: string
  recipeId?: number | null
  isFavorite?: boolean
}

export interface MealSummary<P extends SummaryPlan> {
  totalMeals: number
  filledSlots: number
  totalSlots: number
  emptySlots: number
  completionRate: number
  averageMealsPerDay: number
  daysWithPlans: number
  byMealType: Record<MealTypeKey, number>
  breakdownByType: Record<MealTypeKey, number>
  mostFrequentMeals: Array<{ name: string; mealName: string; count: number }>
  favoriteMeals: P[]
  thisWeekCount: number
  currentStreak: number
  recentMeals: P[]
  monthlyBreakdown: Array<{ month: string; count: number; percentage: number }>
}

const TOP_MEALS = 5
const RECENT_MEALS = 10
const SLOTS_PER_DAY = 3

// Returns 0 for equal dates so the (stable) sort keeps input order on every engine.
const byDateDesc = (a: SummaryPlan, b: SummaryPlan) => b.planDate.localeCompare(a.planDate)

/** Favourite belongs to the meal (recipe, else trimmed lower-case name); keep the newest. */
function favouritesPerMeal<P extends SummaryPlan>(plans: readonly P[]): P[] {
  const byIdentity = new Map<string, P>()
  for (const p of plans) {
    if (!p.isFavorite) continue
    const identity = p.recipeId != null ? `r:${p.recipeId}` : `n:${p.mealName.trim().toLowerCase()}`
    const existing = byIdentity.get(identity)
    if (!existing || p.planDate > existing.planDate) byIdentity.set(identity, p)
  }
  return [...byIdentity.values()].sort(byDateDesc)
}

function weekStartMonday(today: string): string {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  return addDays(today, weekday === 0 ? -6 : 1 - weekday)
}

function streakEndingToday(dates: Set<string>, today: string): number {
  let day = dates.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (dates.has(day)) {
    streak += 1
    day = addDays(day, -1)
  }
  return streak
}

function countBy<T>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return counts
}

export function mealSummary<P extends SummaryPlan>(
  plans: readonly P[],
  opts: { today: string; from?: string; to?: string },
): MealSummary<P> {
  const { today } = opts
  const hasRange = opts.from != null && opts.to != null
  const rangeStart = hasRange
    ? (opts.from as string)
    : plans.reduce((min, p) => (p.planDate < min ? p.planDate : min), plans[0]?.planDate ?? today)
  const rangeEnd = hasRange ? (opts.to as string) : today

  const byMealType: Record<MealTypeKey, number> = { breakfast: 0, lunch: 0, dinner: 0 }
  for (const p of plans) {
    // Rows come from the database: ignore a meal type outside the check constraint.
    if (p.mealType in byMealType) byMealType[p.mealType] += 1
  }

  const days = Math.max(1, daysBetween(rangeStart, rangeEnd) + 1)
  const totalSlots = days * SLOTS_PER_DAY
  const total = plans.length

  const mostFrequentMeals = [...countBy(plans.map((p) => p.mealName)).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_MEALS)
    .map(([name, count]) => ({ name, mealName: name, count }))

  const monthlyBreakdown = [...countBy(plans.map((p) => p.planDate.slice(0, 7))).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count, percentage: total ? (count / total) * 100 : 0 }))

  const weekStart = weekStartMonday(today)
  const weekEnd = addDays(weekStart, 6)
  const dates = new Set(plans.map((p) => p.planDate))

  return {
    totalSlots,
    filledSlots: total,
    totalMeals: total,
    byMealType,
    breakdownByType: byMealType,
    mostFrequentMeals,
    favoriteMeals: favouritesPerMeal(plans),
    daysWithPlans: dates.size,
    averageMealsPerDay: total / days,
    emptySlots: Math.max(0, totalSlots - total),
    completionRate: totalSlots ? total / totalSlots : 0,
    thisWeekCount: plans.filter((p) => p.planDate >= weekStart && p.planDate <= weekEnd).length,
    currentStreak: streakEndingToday(dates, today),
    recentMeals: [...plans].sort(byDateDesc).slice(0, RECENT_MEALS),
    monthlyBreakdown,
  }
}
