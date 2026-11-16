// Unit list of the item form (F-IF-04) and AI-unit normalisation (F-RS-05).

export const UNITS = [
  'piece',
  'kg',
  'g',
  'lb',
  'oz',
  'L',
  'ml',
  'gallon',
  'cup',
  'box',
  'can',
  'bottle',
  'bag',
  'pack',
] as const
export type Unit = (typeof UNITS)[number]

const DEFAULT_UNIT: Unit = 'piece'

// A Map, so AI text like "constructor" can never hit an Object prototype key.
const ALIASES: ReadonlyMap<string, Unit> = new Map<string, Unit>(
  Object.entries({
    pieces: 'piece',
    pc: 'piece',
    pcs: 'piece',
    gram: 'g',
    grams: 'g',
    kgs: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    lbs: 'lb',
    pound: 'lb',
    pounds: 'lb',
    ounce: 'oz',
    ounces: 'oz',
    liter: 'L',
    liters: 'L',
    litre: 'L',
    litres: 'L',
    gallons: 'gallon',
    cups: 'cup',
    boxes: 'box',
    cans: 'can',
    bottles: 'bottle',
    bags: 'bag',
    packs: 'pack',
  }) as Array<[string, Unit]>,
)

export function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value)
}

/** A unit in our list is kept (any case); a known alias maps onto it; anything else is piece. */
export function normalizeUnit(raw: string | null | undefined): Unit {
  const value = raw?.trim() ?? ''
  if (isUnit(value)) return value
  const lower = value.toLowerCase()
  const exact = UNITS.find((u) => u.toLowerCase() === lower)
  return exact ?? ALIASES.get(lower) ?? DEFAULT_UNIT
}
