// What a location looks like on the board: the icon and tint she chose, or a guess from its name for a
// location that has none (an old row, or one made before she picked). Accepts missing fields on purpose, so it
// works before and after the `icon` / `color` columns exist.
import type { IconName } from './Icon'

// The same lists as `LOCATION_ICONS` / `LOCATION_COLORS` in packages/contracts (the API validates with those).
// They are written out here because importing a VALUE from the contracts package pulls zod into the first load
// (about 29 KB gzipped); location-style.test.ts fails if the two lists ever differ.
export const LOCATION_ICONS = [
  'counter',
  'snow',
  'fridge',
  'shelf',
  'refill',
  'cookie',
  'spice',
  'jar',
  'bowl',
  'bag',
  'bottle',
  'leaf',
  'bread',
  'box',
  'pin',
] as const
export type LocationIcon = (typeof LOCATION_ICONS)[number]
export const LOCATION_COLORS = [
  'sand',
  'ice',
  'mint',
  'clay',
  'teal',
  'rose',
  'saffron',
  'lilac',
] as const
export type LocationColor = (typeof LOCATION_COLORS)[number]

/** Compile-time: every location icon is a real icon (this fails to build if a list entry has no path). */
type AllAreIcons = LocationIcon extends IconName ? true : never
export const locationIconsAreIcons: AllAreIcons = true

/** Written out in full so Tailwind finds each class. */
export const LOCATION_TINT_CLASS: Record<LocationColor, string> = {
  sand: 'bg-loc-sand',
  ice: 'bg-loc-ice',
  mint: 'bg-loc-mint',
  clay: 'bg-loc-clay',
  teal: 'bg-loc-teal',
  rose: 'bg-loc-rose',
  saffron: 'bg-loc-saffron',
  lilac: 'bg-loc-lilac',
}

export const LOCATION_COLOR_LABEL: Record<LocationColor, string> = {
  sand: 'Sand',
  ice: 'Ice',
  mint: 'Mint',
  clay: 'Clay',
  teal: 'Teal',
  rose: 'Rose',
  saffron: 'Saffron',
  lilac: 'Lilac',
}

export const LOCATION_ICON_LABEL: Record<LocationIcon, string> = {
  counter: 'Counter',
  snow: 'Freezer',
  fridge: 'Fridge',
  shelf: 'Shelf',
  refill: 'Refills',
  cookie: 'Snacks',
  spice: 'Spices',
  jar: 'Jar',
  bowl: 'Bowl',
  bag: 'Bag',
  bottle: 'Bottle',
  leaf: 'Greens',
  bread: 'Bread',
  box: 'Box',
  pin: 'Other',
}

export type LocationLike = { name: string; icon?: string | null; color?: string | null }
export type LocationStyle = { icon: LocationIcon; color: LocationColor }

// First match wins. Names are the user's own, so this is only a hint when she has not chosen.
const GUESSES: ReadonlyArray<readonly [RegExp, LocationIcon, LocationColor]> = [
  [/freez|\bice\b/i, 'snow', 'ice'],
  [/fridge|refrig/i, 'fridge', 'mint'],
  [/counter/i, 'counter', 'sand'],
  [/refill/i, 'refill', 'teal'],
  [/snack|drink/i, 'cookie', 'rose'],
  [/spice/i, 'spice', 'saffron'],
  [/pantry/i, 'shelf', 'clay'],
  [/shelf/i, 'shelf', 'sand'],
]
const FALLBACK: LocationStyle = { icon: 'pin', color: 'sand' }

const isIcon = (value: unknown): value is LocationIcon =>
  LOCATION_ICONS.some((icon) => icon === value)
const isColor = (value: unknown): value is LocationColor =>
  LOCATION_COLORS.some((color) => color === value)

/** The name-based guess alone. */
export function guessLocationStyle(name: string): LocationStyle {
  const hit = GUESSES.find(([pattern]) => pattern.test(name))
  return hit ? { icon: hit[1], color: hit[2] } : FALLBACK
}

export function locationStyle(location: LocationLike): LocationStyle {
  const guess = guessLocationStyle(location.name)
  return {
    icon: isIcon(location.icon) ? location.icon : guess.icon,
    color: isColor(location.color) ? location.color : guess.color,
  }
}
