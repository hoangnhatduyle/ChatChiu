// What the review step holds and what it sends (SPEC-RS-001). Pure: no React, no requests.
//
// Defaults when review opens (F-RS-04..06): the receipt date is every item's purchase date; the AI's unit is
// kept when it is in our list (else piece); the expiry is the AI's shelf-life hint, else the default for the
// category hint (only when the hint names one of HER categories, loosely: 7.0.33e), counted from the purchase date; a category is picked only when the hint names one of HER
// categories, and the location is the last one she used. Nothing falls back to an id (NC-RS-NO-HARDCODED-LOCATION).
import type { InventoryItemCreate, ReceiptScanLine } from '@chatchiu/contracts'
import {
  addDays,
  defaultShelfLifeDays,
  isExpiryBeforePurchase,
  normalizeUnit,
  perUnitPrice,
} from '@chatchiu/domain'

export const DEFAULT_DAYS_BEFORE = 3
export const MAX_NAME_LENGTH = 200
/** A shelf-life hint beyond ten years is nonsense from the reader: the category default is used instead. */
const MAX_HINT_DAYS = 3650

export type ReviewItem = {
  /** Stable for the life of the review (its position in what the AI read). */
  key: number
  included: boolean
  name: string
  quantity: number
  unit: string
  /** What the receipt line cost in total; stored per unit when added. */
  totalPrice: number | null
  categoryId: number | null
  locationId: number | null
  purchaseDate: string
  expirationDate: string
  notes: string
  notify: boolean
}

export type ReviewContext = {
  purchaseDate: string
  categories: ReadonlyArray<{ id: number; name: string }>
  /** Her last-used location, when it still exists; otherwise null. */
  defaultLocationId: number | null
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** True when `inner` appears in `outer` as whole words in a row ("dairy" in "dairy and eggs"). */
function containsWords(outer: readonly string[], inner: readonly string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) return false
  for (let at = 0; at + inner.length <= outer.length; at += 1) {
    if (inner.every((word, i) => outer[at + i] === word)) return true
  }
  return false
}

/**
 * Which of HER categories a reader's hint names (7.0.33e). An exact name (any case) wins; otherwise the hint
 * may be a whole word or phrase of her category's name ("dairy" for "Dairy & Eggs") or contain it ("pantry
 * staples" for "Pantry"). It picks nothing unless exactly one category fits, so a guess is never made between two.
 */
export function matchCategory<T extends { name: string }>(
  hint: string | null | undefined,
  categories: ReadonlyArray<T>,
): T | undefined {
  const wanted = words(hint ?? '')
  if (wanted.length === 0) return undefined
  const key = wanted.join(' ')
  const exact = categories.find((c) => words(c.name).join(' ') === key)
  if (exact) return exact
  const loose = categories.filter((c) => {
    const own = words(c.name)
    return containsWords(own, wanted) || containsWords(wanted, own)
  })
  return loose.length === 1 ? loose[0] : undefined
}

export function buildReviewItems(
  lines: readonly ReceiptScanLine[],
  ctx: ReviewContext,
): ReviewItem[] {
  return lines.map((line, key) => {
    const category = matchCategory(line.categoryHint, ctx.categories)
    const days =
      line.shelfLifeDaysHint &&
      Number.isFinite(line.shelfLifeDaysHint) &&
      line.shelfLifeDaysHint > 0 &&
      line.shelfLifeDaysHint <= MAX_HINT_DAYS
        ? Math.round(line.shelfLifeDaysHint)
        : defaultShelfLifeDays(category ? line.categoryHint : null)
    return {
      key,
      included: true,
      name: line.name,
      quantity: line.quantity && line.quantity > 0 ? line.quantity : 1,
      unit: normalizeUnit(line.unit),
      totalPrice: line.price != null && line.price > 0 ? line.price : null,
      categoryId: category?.id ?? null,
      locationId: ctx.defaultLocationId,
      purchaseDate: ctx.purchaseDate,
      expirationDate: addDays(ctx.purchaseDate, days),
      notes: '',
      notify: true,
    }
  })
}

/** A calendar date as the API takes it: four-digit year, so a typed 6-digit year or a runaway offset is caught. */
export const isDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

/** What a change to one item may be: fields, or a function of the item as it is NOW (an answer that arrives late). */
export type ItemPatch = Partial<ReviewItem> | ((item: ReviewItem) => Partial<ReviewItem>)

/** Why adding is blocked right now; empty when the included items are complete. */
export function addProblems(items: readonly ReviewItem[]): string[] {
  const chosen = items.filter((i) => i.included)
  if (chosen.length === 0) return ['Select at least one item to add.']
  const problems: Array<[boolean, string]> = [
    [chosen.some((i) => !i.name.trim()), 'Every item needs a name.'],
    [chosen.some((i) => !(i.quantity > 0)), 'Every quantity must be more than zero.'],
    [chosen.some((i) => i.categoryId === null), 'Choose a category for every item you are adding.'],
    [chosen.some((i) => i.locationId === null), 'Choose a location for every item you are adding.'],
    [
      chosen.some((i) => !isDate(i.purchaseDate) || !isDate(i.expirationDate)),
      'Check the dates: one is not valid.',
    ],
    [
      chosen.some((i) => isExpiryBeforePurchase(i.purchaseDate, i.expirationDate)),
      'An expiry date is before its purchase date.',
    ],
  ]
  return problems.filter(([failed]) => failed).map(([, message]) => message)
}

/** The body of the one bulk request: included items only, the price per unit (CS-PER-UNIT-PRICE). Call only when `addProblems` is empty. */
export function toBulkItems(items: readonly ReviewItem[]): InventoryItemCreate[] {
  return items
    .filter((i) => i.included)
    .map((i) => ({
      name: i.name.trim().slice(0, MAX_NAME_LENGTH),
      categoryId: i.categoryId as number,
      locationId: i.locationId as number,
      quantity: i.quantity,
      unit: i.unit,
      purchaseDate: i.purchaseDate,
      expirationDate: i.expirationDate,
      price: perUnitPrice(i.totalPrice, i.quantity),
      notes: i.notes.trim() || null,
      notificationEnabled: i.notify,
      notificationDaysBefore: DEFAULT_DAYS_BEFORE,
      initialQuantity: i.quantity,
      currentQuantity: i.quantity,
    }))
}

export function patchItem(
  items: readonly ReviewItem[],
  key: number,
  patch: ItemPatch,
): ReviewItem[] {
  return items.map((i) =>
    i.key === key ? { ...i, ...(typeof patch === 'function' ? patch(i) : patch) } : i,
  )
}
