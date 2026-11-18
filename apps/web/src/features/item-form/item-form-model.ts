// The item form's rules, pure (SPEC-IF-001): the values she types, what is wrong with them, and the
// request body that follows. Ports OLD item-form.ts onSave: price entered as a total and stored per unit
// (CS-PER-UNIT-PRICE), expiry never before the purchase date, edit keeps the full amount and the amount
// left apart (NC-IF-NO-SILENT-QTY). Nothing here knows about React or the API client.
import type { InventoryItem, InventoryItemCreate, InventoryItemUpdate } from '@chatchiu/contracts'
import {
  getFullQuantity,
  getRemainingQuantity,
  isExpiryBeforePurchase,
  perUnitPrice,
  roundQuantity,
  totalPrice,
  UNITS,
} from '@chatchiu/domain'
import { MAX_AMOUNT, parseAmount } from '../item-panel/amounts'

export const DEFAULT_LOW_STOCK_PERCENT = 20
export const DEFAULT_DAYS_BEFORE = 3
export const MAX_NAME_LENGTH = 200
export const MAX_NOTES_LENGTH = 1000
export const MAX_DAYS_BEFORE = 365
export const DEFAULT_UNIT = 'piece'

export type FormMode = 'add' | 'edit'

/** Everything is held as typed (text) until it is checked, so a half-typed number is never lost. */
export type FormValues = {
  name: string
  categoryId: number | null
  locationId: number | null
  /** Add mode only: what she bought. */
  quantity: string
  /** Edit mode only: the full amount (initial) and what is left now, kept apart (F-IF-12). */
  fullAmount: string
  leftNow: string
  unit: string
  purchaseDate: string | null
  expirationDate: string | null
  /** The total paid; stored per unit (F-IF-09). */
  totalPrice: string
  notes: string
  notify: boolean
  daysBefore: string
  lowStock: string
}

export type FieldName =
  | 'name'
  | 'category'
  | 'location'
  | 'quantity'
  | 'fullAmount'
  | 'leftNow'
  | 'unit'
  | 'purchaseDate'
  | 'expiry'
  | 'totalPrice'
  | 'notes'
  | 'daysBefore'
  | 'lowStock'
export type FormErrors = Partial<Record<FieldName, string>>

export function newFormValues(options: { today: string; locationId?: number | null }): FormValues {
  return {
    name: '',
    categoryId: null,
    locationId: options.locationId ?? null,
    quantity: '1',
    fullAmount: '',
    leftNow: '',
    unit: DEFAULT_UNIT,
    purchaseDate: options.today,
    expirationDate: null,
    totalPrice: '',
    notes: '',
    notify: true,
    daysBefore: String(DEFAULT_DAYS_BEFORE),
    lowStock: String(DEFAULT_LOW_STOCK_PERCENT),
  }
}

const text = (value: number) => String(roundQuantity(value))

export function formValuesFromItem(item: InventoryItem): FormValues {
  const full = getFullQuantity(item)
  const total = totalPrice(item.price, full)
  return {
    name: item.name,
    categoryId: item.categoryId,
    locationId: item.locationId,
    quantity: text(item.quantity),
    fullAmount: text(full),
    leftNow: text(getRemainingQuantity(item)),
    unit: item.unit,
    purchaseDate: item.purchaseDate,
    expirationDate: item.expirationDate,
    // Edit shows the total again: price per unit x full amount (NC-IF-PER-UNIT).
    totalPrice: total === null ? '' : total.toFixed(2),
    notes: item.notes ?? '',
    notify: item.notificationEnabled,
    daysBefore: String(item.notificationDaysBefore),
    lowStock: String(item.lowStockThreshold ?? DEFAULT_LOW_STOCK_PERCENT),
  }
}

const isAmount = (value: number) => value > 0 && value <= MAX_AMOUNT

/** What is wrong, field by field; empty when the form can be sent (an invalid form is never sent). */
export function validate(values: FormValues, mode: FormMode, original?: InventoryItem): FormErrors {
  const errors: FormErrors = {}
  const name = values.name.trim()
  if (name === '') errors.name = 'Enter a name.'
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Use at most ${MAX_NAME_LENGTH} characters.`
  if (values.categoryId === null) errors.category = 'Choose a category.'
  if (values.locationId === null) errors.location = 'Choose a location.'

  const unitOk =
    (UNITS as readonly string[]).includes(values.unit) || values.unit === original?.unit
  if (!unitOk) errors.unit = 'Choose a unit from the list.'

  if (mode === 'add') {
    if (!isAmount(parseAmount(values.quantity))) errors.quantity = 'Enter an amount above 0.'
  } else {
    const full = parseAmount(values.fullAmount)
    const left = parseAmount(values.leftNow)
    if (!isAmount(full)) errors.fullAmount = 'Enter an amount above 0.'
    if (!(left >= 0 && left <= MAX_AMOUNT)) errors.leftNow = 'Enter what is left, 0 or more.'
    else if (isAmount(full) && left > full) {
      errors.leftNow = "Left now can't be more than the full amount."
    }
  }

  if (values.expirationDate === null) errors.expiry = 'Choose an expiry date.'
  else if (isExpiryBeforePurchase(values.purchaseDate, values.expirationDate)) {
    errors.expiry = "The expiry date can't be before the purchase date."
  }

  if (values.totalPrice.trim() !== '') {
    const total = parseAmount(values.totalPrice)
    if (!(total >= 0 && total <= MAX_AMOUNT))
      errors.totalPrice = 'Enter the total you paid, or leave it empty.'
  }
  if (values.notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Use at most ${MAX_NOTES_LENGTH} characters.`
  }
  const days = parseAmount(values.daysBefore)
  if (!(Number.isInteger(days) && days >= 0 && days <= MAX_DAYS_BEFORE)) {
    errors.daysBefore = `Enter a whole number of days, 0 to ${MAX_DAYS_BEFORE}.`
  }
  const low = parseAmount(values.lowStock)
  if (!(low >= 0 && low <= 100)) errors.lowStock = 'Enter a percent from 0 to 100.'
  return errors
}

const trimmedOrNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

/** The price per unit for a typed total and amount: null when no total was typed. */
function unitPriceOf(values: FormValues, amount: number): number | null {
  return values.totalPrice.trim() === ''
    ? null
    : perUnitPrice(parseAmount(values.totalPrice), amount)
}

/** The body of a new item. Call only for values that passed `validate`. */
export function createBody(values: FormValues): InventoryItemCreate {
  const quantity = parseAmount(values.quantity)
  return {
    name: values.name.trim(),
    categoryId: values.categoryId as number,
    locationId: values.locationId as number,
    quantity,
    unit: values.unit,
    purchaseDate: values.purchaseDate,
    expirationDate: values.expirationDate as string,
    price: unitPriceOf(values, quantity),
    notes: trimmedOrNull(values.notes),
    notificationEnabled: values.notify,
    notificationDaysBefore: parseAmount(values.daysBefore),
    // A new item starts full (as the old app saved it).
    initialQuantity: quantity,
    currentQuantity: quantity,
    lowStockThreshold: parseAmount(values.lowStock),
  }
}

const PRICE_TOLERANCE = 1e-6
const samePrice = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < PRICE_TOLERANCE

/**
 * Only what changed (CS-ZOD4-NO-UPDATE-DEFAULTS): changing the full amount never sends the amount left
 * and the other way round (NC-IF-NO-SILENT-QTY). Call only for values that passed `validate`.
 */
export function updatePatch(values: FormValues, original: InventoryItem): InventoryItemUpdate {
  const before = formValuesFromItem(original)
  const patch: InventoryItemUpdate = {}
  const name = values.name.trim()
  if (name !== original.name) patch.name = name
  if (values.categoryId !== original.categoryId) patch.categoryId = values.categoryId as number
  if (values.locationId !== original.locationId) patch.locationId = values.locationId as number
  if (values.unit !== original.unit) patch.unit = values.unit

  const full = parseAmount(values.fullAmount)
  const fullChanged = full !== parseAmount(before.fullAmount)
  if (fullChanged) {
    patch.initialQuantity = full
    patch.quantity = full
  }
  const left = parseAmount(values.leftNow)
  // A null amount left reads as "the full amount": when the full amount changes, say what is left, so
  // it does not silently follow (NC-IF-NO-SILENT-QTY).
  const leftIsImplicit = original.currentQuantity === null
  if (left !== parseAmount(before.leftNow) || (fullChanged && leftIsImplicit)) {
    patch.currentQuantity = left
  }

  if (values.purchaseDate !== original.purchaseDate) patch.purchaseDate = values.purchaseDate
  if (values.expirationDate !== original.expirationDate) {
    patch.expirationDate = values.expirationDate as string
  }
  // The total is shown as price x full amount, so a new full amount re-divides the same total.
  if (values.totalPrice !== before.totalPrice || fullChanged) {
    const totalUntouched = values.totalPrice === before.totalPrice
    // An untouched total is not re-read from the rounded text: scale the stored price exactly.
    const price =
      totalUntouched && original.price !== null
        ? (original.price * getFullQuantity(original)) / full
        : unitPriceOf(values, full)
    if (!samePrice(price, original.price)) patch.price = price
  }
  const notes = trimmedOrNull(values.notes)
  if (notes !== original.notes) patch.notes = notes
  if (values.notify !== original.notificationEnabled) patch.notificationEnabled = values.notify
  const days = parseAmount(values.daysBefore)
  if (days !== original.notificationDaysBefore) patch.notificationDaysBefore = days
  const low = parseAmount(values.lowStock)
  if (low !== (original.lowStockThreshold ?? DEFAULT_LOW_STOCK_PERCENT)) {
    patch.lowStockThreshold = low
  }
  return patch
}

const MIN_TYPED = 2
const MAX_SUGGESTIONS = 5

/** Distinct existing names that contain what was typed (starting with it first), never the typed name itself. */
export function suggestNames(typed: string, existing: readonly string[]): string[] {
  const wanted = typed.trim().toLowerCase()
  if (wanted.length < MIN_TYPED) return []
  const seen = new Set<string>()
  const matches: string[] = []
  for (const name of existing) {
    const lower = name.trim().toLowerCase()
    if (lower === wanted || !lower.includes(wanted) || seen.has(lower)) continue
    seen.add(lower)
    matches.push(name.trim())
  }
  const starts = (n: string) => (n.toLowerCase().startsWith(wanted) ? 0 : 1)
  return matches
    .sort((a, b) => starts(a) - starts(b) || a.localeCompare(b))
    .slice(0, MAX_SUGGESTIONS)
}
