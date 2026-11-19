// UI refresh foundation: a category's tint always leaves its text readable (CS-ACCESSIBLE-UI, 4.5:1), in both themes.
import { render, screen } from '@testing-library/react'
import {
  CATEGORY_COLOURS,
  categoryVars,
  NEUTRAL_CATEGORY_COLOUR,
  safeCategoryColour,
} from './category-colours'
import { CategoryPill } from './CategoryStyle'
import tokensCss from '../styles/tokens.css?raw'

const SYSTEM_COLOURS = [
  '#FFEB3B',
  '#4CAF50',
  '#F44336',
  '#03A9F4',
  '#00BCD4',
  '#FF9800',
  '#9C27B0',
  '#E91E63',
  '#795548',
  '#FFC107',
  '#F2B2B2',
  '#9E9E9E',
]
const EXTREMES = ['#000000', '#ffffff', '#fff', '#123']

const rgb = (hex: string): [number, number, number] => {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const mix = (cat: string, surface: string, amount: number) => {
  const [c, s] = [rgb(cat), rgb(surface)]
  const out = c.map((v, i) => Math.round(v * amount + (s[i] ?? 0) * (1 - amount)))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
const token = (block: 'light' | 'dark', name: string): string => {
  const re = block === 'light' ? /:root\s*\{([^}]*)\}/ : /:root\[data-theme='dark'\]\s*\{([^}]*)\}/
  const body = tokensCss.match(re)?.[1] ?? ''
  return body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
}

describe('category tint', () => {
  const colours = [...SYSTEM_COLOURS, ...CATEGORY_COLOURS.map((c) => c.value), ...EXTREMES]

  it.each(['light', 'dark'] as const)(
    'CS-ACCESSIBLE-UI: ink on a 16 % mix of any category colour over the %s card is at least 4.5:1',
    (theme) => {
      const surface = token(theme, 'surface')
      const ink = token(theme, 'ink')
      for (const colour of colours) {
        expect(
          ratio(ink, mix(colour, surface, 0.16)),
          `${colour} on ${theme}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('falls back to a neutral colour for a missing or unsafe value (nothing else reaches a style attribute)', () => {
    expect(safeCategoryColour(null)).toBe(NEUTRAL_CATEGORY_COLOUR)
    expect(safeCategoryColour('red; background:url(x)')).toBe(NEUTRAL_CATEGORY_COLOUR)
    expect(safeCategoryColour(' #4CAF50 ')).toBe('#4CAF50')
    expect(categoryVars('nope')).toEqual({ '--cat': NEUTRAL_CATEGORY_COLOUR })
  })

  it('the pill writes the category name, so colour is never the only cue', () => {
    render(<CategoryPill name="Dairy" colour="#FFEB3B" />)
    expect(screen.getByText('Dairy')).toBeInTheDocument()
  })
})
