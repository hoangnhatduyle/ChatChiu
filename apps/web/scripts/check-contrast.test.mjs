// @vitest-environment node
// Step 3.1 gate: every token pair in tokens.css meets WCAG 2.2 AA in both themes.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  checkContrast,
  contrastRatio,
  GRAPHIC_MIN,
  PAIRS,
  parseThemes,
  TEXT_MIN,
} from './check-contrast.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-contrast.mjs')
const tokensCss = readFileSync(join(here, '../src/styles/tokens.css'), 'utf8')

/** @type {(light: string, dark: string) => string} */
const fixture = (light, dark) => `
:root { ${light} }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ${dark} } }
:root[data-theme='dark'] { ${dark} }
`

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#FFFFFF', '#777777')).toBeCloseTo(4.48, 2)
  })

  it('accepts 3-digit hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5)
  })
})

describe('parseThemes', () => {
  it('reads the light, dark media-query and data-theme dark blocks', () => {
    const themes = parseThemes(fixture('--ink: #111111;', '--ink: #EEEEEE;'))
    expect(themes.light.ink).toBe('#111111')
    expect(themes.dark.ink).toBe('#EEEEEE')
    expect(themes.darkMedia.ink).toBe('#EEEEEE')
  })
})

describe('checkContrast', () => {
  it('reports a text pair below 4.5:1', () => {
    const themes = parseThemes(
      fixture('--a: #777777; --b: #FFFFFF;', '--a: #000000; --b: #FFFFFF;'),
    )
    const { failures } = checkContrast(themes, [{ fg: 'a', bg: 'b', min: TEXT_MIN, use: 'text' }])
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ theme: 'light', fg: 'a', bg: 'b' })
  })

  it('reports a token a pair names but a theme does not define', () => {
    const themes = parseThemes(fixture('--a: #000000;', '--a: #000000; --b: #FFFFFF;'))
    const { failures } = checkContrast(themes, [{ fg: 'a', bg: 'b', min: TEXT_MIN, use: 'text' }])
    expect(failures.map((f) => f.theme)).toEqual(['light'])
    expect(failures[0]?.reason).toMatch(/missing/i)
  })

  it('reports drift between the media-query dark block and the [data-theme=dark] block', () => {
    const css = `
      :root { --a: #000000; }
      @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --a: #FFFFFF; } }
      :root[data-theme='dark'] { --a: #EEEEEE; }`
    const { failures } = checkContrast(parseThemes(css), [])
    expect(failures.some((f) => /drift/i.test(f.reason))).toBe(true)
  })
})

// The gate must read the value the browser uses, or fail loudly. Each case below once passed
// silently or failed with a misleading message (step 3.1 typescript review, H1/H2/M1/M3).
describe('parser hardening', () => {
  /** @type {import('./check-contrast.mjs').Pair[]} */
  const pair = [{ fg: 'a', bg: 'b', min: TEXT_MIN, use: 'text' }]
  const dark = '--a: #000000; --b: #FFFFFF;'
  /** @param {string} css */
  const reasons = (css) => checkContrast(parseThemes(css), pair).failures.map((f) => f.reason)

  it('ignores a commented-out declaration (the live value is checked)', () => {
    const css = fixture('--a: #FFFFFF; /* --a: #000000; */ --b: #FFFFFF;', dark)
    expect(reasons(css)).toContain('below AA')
  })

  it("survives a comment containing '}' inside a block", () => {
    const css = fixture('/* note: } */ --a: #000000; --b: #FFFFFF;', dark)
    expect(reasons(css)).toEqual([])
  })

  it('fails a paired token declared twice in one block', () => {
    const css = fixture('--a: #000000; --a: #111111; --b: #FFFFFF;', dark)
    expect(reasons(css).some((r) => /declared 2 times/.test(r))).toBe(true)
  })

  it('fails a paired token whose value is not a hex colour, naming the value', () => {
    const css = fixture('--a: oklch(95% 0 0); --b: #FFFFFF;', dark)
    expect(
      reasons(css).some((r) => /--a is not a hex colour \(got oklch\(95% 0 0\)\)/.test(r)),
    ).toBe(true)
  })

  it('fails an alpha hex on a paired token instead of throwing', () => {
    const css = fixture('--a: #00000080; --b: #FFFFFF;', dark)
    expect(reasons(css).some((r) => /not a hex colour/.test(r))).toBe(true)
  })

  it('reads the last declaration of a block even without a trailing semicolon', () => {
    const css = fixture('--b: #FFFFFF; --a: #000000', dark)
    expect(reasons(css)).toEqual([])
  })

  it('finds a light :root that follows an @import or another statement', () => {
    const css = `@import './x.css';\n${fixture('--a: #000000; --b: #FFFFFF;', dark)}`
    expect(reasons(css)).toEqual([])
  })

  it('accepts double-quoted [data-theme="dark"] selectors', () => {
    const css = fixture('--a: #000000; --b: #FFFFFF;', dark).replaceAll("'", '"')
    expect(reasons(css)).toEqual([])
  })

  it('F-SE-06: reports drift in non-colour tokens (scrim, shadows) between the dark blocks', () => {
    const css = `
      :root { --a: #000000; --b: #FFFFFF; }
      @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ${dark} --scrim: rgb(0 0 0 / 0.5); } }
      :root[data-theme='dark'] { ${dark} --scrim: rgb(0 0 0 / 0.3); }`
    expect(reasons(css).some((r) => /drift/.test(r))).toBe(true)
  })

  it('does not report drift when the dark blocks only differ in order', () => {
    const css = `
      :root { --a: #000000; --b: #FFFFFF; }
      @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --a: #000000; --b: #FFFFFF; } }
      :root[data-theme='dark'] { --b: #FFFFFF; --a: #000000; }`
    expect(reasons(css)).toEqual([])
  })
})

describe('tokens.css (Fresh Ledger / Night Kitchen)', () => {
  const themes = parseThemes(tokensCss)

  it('CS-ACCESSIBLE-UI: every token pair meets WCAG 2.2 AA in light (Fresh Ledger)', () => {
    const { failures } = checkContrast(themes, PAIRS)
    expect(failures.filter((f) => f.theme === 'light')).toEqual([])
  })

  it('CS-ACCESSIBLE-UI: every token pair meets WCAG 2.2 AA in dark (Night Kitchen)', () => {
    const { failures } = checkContrast(themes, PAIRS)
    expect(failures.filter((f) => f.theme !== 'light')).toEqual([])
  })

  it('F-SE-06: the prefers-color-scheme dark block equals the [data-theme=dark] block', () => {
    expect(themes.darkMedia).toEqual(themes.dark)
  })

  it('CS-TOKENS: light and dark define the same colour tokens', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort())
  })

  it('checks text pairs at 4.5:1 and graphics (bars, borders, focus) at 3:1', () => {
    expect(PAIRS.filter((p) => p.use === 'text').every((p) => p.min === TEXT_MIN)).toBe(true)
    expect(PAIRS.filter((p) => p.use === 'graphic').every((p) => p.min === GRAPHIC_MIN)).toBe(true)
    expect(PAIRS.some((p) => p.fg === 'focus')).toBe(true)
    expect(PAIRS.some((p) => p.fg === 'field-line')).toBe(true)
  })

  it('CS-ACCESSIBLE-UI: gates what the usage slider, chips and toast draw (a11y review C1, C2, H1)', () => {
    const has = (/** @type {string} */ fg, /** @type {string} */ bg) =>
      PAIRS.some((p) => p.fg === fg && p.bg === bg && p.use === 'graphic')
    // Thumb: fill-coloured disc with a surface ring, so it stays visible over the fill.
    expect(has('surface', 'fill')).toBe(true)
    expect(has('surface', 'low')).toBe(true)
    // Selected filter chip against what surrounds it.
    expect(has('chip-on', 'surface')).toBe(true)
    expect(has('chip-on', 'bg')).toBe(true)
    // Focus inside the toast uses the toast ink as its ring colour.
    expect(has('toast-ink', 'toast')).toBe(true)
    expect(has('focus', 'rail-on')).toBe(true)
  })

  it('CS-ACCESSIBLE-UI: gates hover, pressed, disabled and error states (step 3.2, a11y review H3/M1)', () => {
    const text = (/** @type {string} */ fg, /** @type {string} */ bg) =>
      PAIRS.some((p) => p.fg === fg && p.bg === bg && p.use === 'text')
    const graphicPair = (/** @type {string} */ fg, /** @type {string} */ bg) =>
      PAIRS.some((p) => p.fg === fg && p.bg === bg && p.use === 'graphic')
    for (const bg of ['hover', 'pressed']) {
      for (const fg of ['ink', 'muted', 'low', 'accent']) expect(text(fg, bg)).toBe(true)
    }
    expect(text('accent-ink', 'accent-hover')).toBe(true)
    expect(text('error', 'surface')).toBe(true)
    expect(text('error', 'bg')).toBe(true)
    expect(graphicPair('error', 'surface')).toBe(true)
    expect(graphicPair('disabled-ink', 'disabled-bg')).toBe(true)
  })
})

describe('CLI', () => {
  it('exits 0 for the real tokens.css', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/^Contrast OK: \d+ pairs/)
  })

  it('exits 1 and names the pair when a file misses AA', () => {
    const dir = mkdtempSync(join(tmpdir(), 'contrast-'))
    const file = join(dir, 'tokens.css')
    writeFileSync(file, fixture('--ink: #999999; --bg: #FFFFFF;', '--ink: #FFFFFF; --bg: #000000;'))
    const run = spawnSync(process.execPath, [script, file], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/light --ink on --bg 2\.85:1 \(needs 4\.5:1\): below AA/)
  })
})
