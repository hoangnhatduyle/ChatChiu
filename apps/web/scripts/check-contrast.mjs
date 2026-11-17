// @ts-check
// Contrast gate (roadmap 3.1, architecture.md §4): every token pair the UI draws must meet
// WCAG 2.2 AA in both themes: 4.5:1 for text, 3:1 for graphics (bars, borders, focus rings;
// WCAG 1.4.11). It also fails when the two dark blocks drift apart, or when a paired token is
// missing, declared twice in a block, or not a plain hex colour, so it never passes silently on a
// value the browser does not actually use.
// Usage: node scripts/check-contrast.mjs [path/to/tokens.css]   (runs before every web build)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** WCAG 2.2 SC 1.4.3: normal text. */
export const TEXT_MIN = 4.5
/** WCAG 2.2 SC 1.4.11: user-interface components and graphical objects. */
export const GRAPHIC_MIN = 3

/** @typedef {{ fg: string, bg: string, min: number, use: 'text' | 'graphic' }} Pair */
/** @typedef {Record<string, string>} Block  token name (no `--`) or `:property` → raw value */
/** @typedef {{ light: Block, darkMedia: Block, dark: Block, repeats: Record<string, Record<string, number>> }} Themes */
/** @typedef {Pair & { theme: string, ratio: number }} Result */
/** @typedef {Partial<Result> & { theme: string, reason: string }} Failure */

/** @type {(fg: string, bg: string) => Pair} */
const text = (fg, bg) => ({ fg, bg, min: TEXT_MIN, use: 'text' })
/** @type {(fg: string, bg: string) => Pair} */
const graphic = (fg, bg) => ({ fg, bg, min: GRAPHIC_MIN, use: 'graphic' })

/** Every foreground/background pair the components draw. @type {Pair[]} */
export const PAIRS = [
  // Body text and secondary text on every surface they appear on
  ...['bg', 'surface', 'icon-bg', 'rail', 'rail-on'].map((bg) => text('ink', bg)),
  ...['bg', 'surface', 'icon-bg', 'rail'].map((bg) => text('muted', bg)),
  // Links and accent text; text on accent buttons
  text('accent', 'bg'),
  text('accent', 'surface'),
  text('accent', 'icon-bg'),
  text('accent', 'rail-on'),
  text('accent-ink', 'accent'),
  // Low-stock percent text (also on a selected row, which uses icon-bg)
  text('low', 'bg'),
  text('low', 'surface'),
  text('low', 'icon-bg'),
  // Navigation (rail on tablet, bottom bar on phone uses the surface)
  text('rail-ink', 'rail'),
  text('rail-ink', 'surface'),
  text('rail-on-ink', 'rail-on'),
  text('rail-on-ink', 'rail'),
  text('rail-on-ink', 'surface'),
  text('icon-ink', 'icon-bg'),
  // Selected chip (text, and the chip against what surrounds it), toast and its action
  text('chip-on-ink', 'chip-on'),
  graphic('chip-on', 'surface'),
  graphic('chip-on', 'bg'),
  text('toast-ink', 'toast'),
  text('toast-act', 'toast'),
  // Expiry chips
  ...['expired', 'today', 'soon', 'ok'].map((s) => text(`status-${s}-fg`, `status-${s}-bg`)),
  // Usage bar fill against its track
  graphic('fill', 'track'),
  graphic('low', 'track'),
  // Slider thumb: a fill-coloured disc with a surface ring, visible over the fill (a11y review C2)
  graphic('surface', 'fill'),
  graphic('surface', 'low'),
  // Input and control borders
  graphic('field-line', 'surface'),
  graphic('field-line', 'bg'),
  // Focus ring against whatever it sits on
  ...['bg', 'surface', 'rail', 'icon-bg', 'rail-on'].map((bg) => graphic('focus', bg)),
  // Inside the toast the ring uses the toast ink, since --focus is too close to --toast (C1)
  graphic('toast-ink', 'toast'),
  // Filled buttons (accent, Move to waste) against the surface around them
  graphic('accent', 'surface'),
  graphic('accent', 'bg'),
  graphic('status-expired-bg', 'surface'),
]

// sRGB → relative luminance, WCAG 2.2 definition.
const SRGB_LINEAR_THRESHOLD = 0.04045
const SRGB_LINEAR_DIVISOR = 12.92
const SRGB_GAMMA_OFFSET = 0.055
const SRGB_GAMMA_SCALE = 1.055
const SRGB_GAMMA = 2.4
const LUMA_RED = 0.2126
const LUMA_GREEN = 0.7152
const LUMA_BLUE = 0.0722
const FLARE = 0.05

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** @param {number} v 0–255 */
const channel = (v) => {
  const c = v / 255
  return c <= SRGB_LINEAR_THRESHOLD
    ? c / SRGB_LINEAR_DIVISOR
    : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA
}

/** @param {string} hex */
const luminance = (hex) => {
  if (!HEX_COLOUR.test(hex)) throw new Error(`Not a hex colour: ${hex}`)
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)))
  return LUMA_RED * (r ?? 0) + LUMA_GREEN * (g ?? 0) + LUMA_BLUE * (b ?? 0)
}

/** WCAG contrast ratio of two hex colours (order does not matter). */
export function contrastRatio(/** @type {string} */ a, /** @type {string} */ b) {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + FLARE) / (lo + FLARE)
}

const SELECTORS = {
  // `:root {` at the start of the file or after a statement, never `:root:not(…)` or `:root[…]`
  light: /(?:^|[;}])\s*:root\s*\{([^}]*)\}/,
  darkMedia: /:root:not\(\[data-theme=(['"])light\1\]\)\s*\{([^}]*)\}/,
  dark: /:root\[data-theme=(['"])dark\1\]\s*\{([^}]*)\}/,
}
const DECLARATION = /(--[\w-]+|[a-z-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g

/**
 * Reads one block: every declaration's final raw value, plus how often each name was declared.
 * Custom properties are keyed without `--`; other properties as `:name` (e.g. `:color-scheme`).
 * @param {string} body
 */
function readBlock(body) {
  /** @type {Block} */
  const values = {}
  /** @type {Record<string, number>} */
  const counts = {}
  for (const [, prop = '', value = ''] of body.matchAll(DECLARATION)) {
    const key = prop.startsWith('--') ? prop.slice(2) : `:${prop}`
    values[key] = value
    counts[key] = (counts[key] ?? 0) + 1
  }
  const repeats = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 1))
  return { values, repeats }
}

/** Token blocks of the light theme, the media-query dark block and the data-theme dark block. */
export function parseThemes(/** @type {string} */ css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  /** @type {(re: RegExp) => ReturnType<typeof readBlock>} */
  const block = (re) => {
    const m = clean.match(re)
    return readBlock(m ? (m[m.length - 1] ?? '') : '')
  }
  const light = block(SELECTORS.light)
  const darkMedia = block(SELECTORS.darkMedia)
  const dark = block(SELECTORS.dark)
  return /** @type {Themes} */ ({
    light: light.values,
    darkMedia: darkMedia.values,
    dark: dark.values,
    repeats: { light: light.repeats, darkMedia: darkMedia.repeats, dark: dark.repeats },
  })
}

/** @param {Block} block */
const sorted = (block) => JSON.stringify(Object.entries(block).sort(([a], [b]) => (a < b ? -1 : 1)))

/**
 * Checks each pair in every theme, plus drift between the two dark blocks.
 * @param {Themes} themes
 * @param {Pair[]} pairs
 */
export function checkContrast(themes, pairs) {
  /** @type {Failure[]} */
  const failures = []
  /** @type {Result[]} */
  const results = []
  if (sorted(themes.darkMedia) !== sorted(themes.dark)) {
    failures.push({
      theme: 'dark',
      reason: "drift: the prefers-color-scheme block differs from [data-theme='dark']",
    })
  }
  const paired = new Set(pairs.flatMap((p) => [p.fg, p.bg]))
  for (const [theme, key] of /** @type {const} */ ([
    ['light', 'light'],
    ['dark', 'dark'],
    ['dark', 'darkMedia'],
  ])) {
    for (const [name, n] of Object.entries(themes.repeats?.[key] ?? {})) {
      if (paired.has(name))
        failures.push({ theme, reason: `--${name} declared ${n} times in one block` })
    }
  }
  for (const [theme, tokens] of /** @type {const} */ ([
    ['light', themes.light],
    ['dark', themes.dark],
  ])) {
    for (const pair of pairs) {
      const problem = [pair.fg, pair.bg]
        .map((name) => [name, tokens[name]])
        .map(([name, value]) =>
          value === undefined
            ? `missing token --${name}`
            : HEX_COLOUR.test(value ?? '')
              ? null
              : `--${name} is not a hex colour (got ${value})`,
        )
        .find(Boolean)
      if (problem) {
        failures.push({ theme, ...pair, reason: problem })
        continue
      }
      const ratio = contrastRatio(tokens[pair.fg] ?? '', tokens[pair.bg] ?? '')
      results.push({ theme, ...pair, ratio })
      if (ratio < pair.min) failures.push({ theme, ...pair, ratio, reason: 'below AA' })
    }
  }
  return { failures, results }
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const file = process.argv[2] ?? join(here, '../src/styles/tokens.css')
  const { failures, results } = checkContrast(parseThemes(readFileSync(file, 'utf8')), PAIRS)
  if (failures.length > 0) {
    for (const f of failures) {
      const pair = f.fg ? ` --${f.fg} on --${f.bg}` : ''
      const ratio = f.ratio ? ` ${f.ratio.toFixed(2)}:1 (needs ${f.min}:1)` : ''
      console.error(`✗ ${f.theme}${pair}${ratio}: ${f.reason}`)
    }
    process.exit(1)
  }
  const closest = results.reduce((a, b) => (b.ratio / b.min < a.ratio / a.min ? b : a))
  console.log(
    `Contrast OK: ${results.length} pairs in light and dark. Closest to the limit: ${closest.theme} ` +
      `--${closest.fg} on --${closest.bg} ${closest.ratio.toFixed(2)}:1 (needs ${closest.min}:1)`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
