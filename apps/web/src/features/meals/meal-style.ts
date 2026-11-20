// The colours of the meal plan (UI refresh): each meal type has its own tint (breakfast amber, lunch green, dinner
// indigo) and a recipe gets a tint of its own from its name, so it looks the same every time. The type word is always
// written beside the colour, so colour is never the only cue. Class names are written out in full for Tailwind.
import type { MealSlotType } from '@chatchiu/domain'

export const MEAL_TONE: Record<MealSlotType, string> = {
  breakfast: 'bg-tint-amber text-tint-amber-ink',
  lunch: 'bg-tint-green text-tint-green-ink',
  dinner: 'bg-tint-indigo text-tint-indigo-ink',
}

/** A small dot in the type's ink colour (decorative). */
export const MEAL_DOT: Record<MealSlotType, string> = {
  breakfast: 'bg-tint-amber-ink',
  lunch: 'bg-tint-green-ink',
  dinner: 'bg-tint-indigo-ink',
}

export const RECIPE_TONES = [
  'bg-tint-red text-tint-red-ink',
  'bg-tint-amber text-tint-amber-ink',
  'bg-tint-orange text-tint-orange-ink',
  'bg-tint-green text-tint-green-ink',
  'bg-tint-teal text-tint-teal-ink',
  'bg-tint-indigo text-tint-indigo-ink',
] as const

/** The same name always gets the same tint (case and spacing do not matter). */
export function recipeTone(name: string): (typeof RECIPE_TONES)[number] {
  let sum = 0
  for (const ch of name.trim().toLowerCase()) sum += ch.codePointAt(0) ?? 0
  return RECIPE_TONES[sum % RECIPE_TONES.length] as (typeof RECIPE_TONES)[number]
}

/** The first letter of the name, for the recipe's tinted badge. */
export function recipeInitial(name: string): string {
  const first = [...name.trim()][0]
  return first ? first.toLocaleUpperCase() : '?'
}
