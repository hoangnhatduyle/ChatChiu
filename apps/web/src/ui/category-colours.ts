import type { CSSProperties } from 'react'

// The icons and colours a category can have (F-SE-02). Icons are emoji, as the old app stored them; colours
// are a small named set so every one has a readable name and works on both themes.
export const CATEGORY_ICONS = [
  '📦',
  '🥛',
  '🧀',
  '🥚',
  '🥬',
  '🥦',
  '🥕',
  '🍅',
  '🍎',
  '🍌',
  '🍓',
  '🥩',
  '🍗',
  '🐟',
  '🍞',
  '🥐',
  '🍫',
  '🥫',
  '🍝',
  '🍚',
  '🧂',
  '🥤',
  '☕',
  '🧊',
  '🍯',
  '🥜',
  '🛒',
  '🧴',
] as const

export const CATEGORY_COLOURS = [
  { name: 'Red', value: '#c0392b' },
  { name: 'Orange', value: '#d9822b' },
  { name: 'Gold', value: '#b8921f' },
  { name: 'Green', value: '#2e7d32' },
  { name: 'Teal', value: '#0b6e75' },
  { name: 'Blue', value: '#2f6fb3' },
  { name: 'Purple', value: '#7b4fa3' },
  { name: 'Grey', value: '#6b7280' },
] as const

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Used for a category with no colour, or one that is not a plain hex (nothing else is ever written into a style). */
export const NEUTRAL_CATEGORY_COLOUR = '#9e9e9e'

/** A colour that is safe to put in a style attribute: a plain hex, else the neutral grey. */
export function safeCategoryColour(colour: string | null | undefined): string {
  return colour && HEX.test(colour.trim()) ? colour.trim() : NEUTRAL_CATEGORY_COLOUR
}

/** The one custom property the category styles read (`--cat`). */
export function categoryVars(colour: string | null | undefined): CSSProperties {
  return { ['--cat' as string]: safeCategoryColour(colour) }
}
