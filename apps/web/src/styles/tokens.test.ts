// Step 3.1: structure of the design tokens (architecture.md §4, CS-TOKENS, CS-ACCESSIBLE-UI).
import baseCss from './base.css?raw'
import tokensCss from './tokens.css?raw'

const decl = (css: string, name: string) =>
  css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim()

describe('tokens.css', () => {
  it('CS-TOKENS: radius is 14 px for cards and 8 px for controls', () => {
    expect(decl(tokensCss, '--radius-card')).toBe('14px')
    expect(decl(tokensCss, '--radius-control')).toBe('8px')
  })

  it('CS-ACCESSIBLE-UI: the touch-target token is 44 px', () => {
    expect(decl(tokensCss, '--spacing-touch')).toBe('44px')
  })

  it('layout tokens: 84 px nav rail from 768 px', () => {
    expect(decl(tokensCss, '--spacing-rail')).toBe('84px')
    expect(decl(tokensCss, '--breakpoint-md')).toBe('768px')
  })

  it('F-SE-06: dark applies on prefers-color-scheme (unless data-theme=light) and on data-theme=dark', () => {
    expect(tokensCss).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)/,
    )
    expect(tokensCss).toMatch(/:root\[data-theme='dark'\]\s*\{/)
    expect(tokensCss).toMatch(/color-scheme:\s*dark/)
  })

  it('CS-TOKENS: Tailwind exposes only token colours (default palette cleared)', () => {
    expect(tokensCss).toMatch(/--color-\*:\s*initial/)
    expect(decl(tokensCss, '--color-accent')).toBe('var(--accent)')
  })

  it('F-AP-05: UI type is Inter Tight and numbers are IBM Plex Mono', () => {
    expect(decl(tokensCss, '--font-sans')).toMatch(/^'Inter Tight'/)
    expect(decl(tokensCss, '--font-mono')).toMatch(/^'IBM Plex Mono'/)
  })

  it('CS-ACCESSIBLE-UI: type sizes are rem, so the device text-size setting scales them', () => {
    const sizes = [...tokensCss.matchAll(/--text-([a-z0-9]+):\s*([^;]+);/g)]
    expect(sizes.length).toBeGreaterThanOrEqual(10)
    for (const [, , value] of sizes) expect(value).toMatch(/^[\d.]+rem$/)
  })

  it('F-AP-05: line-height is at least 1.3 wherever Vietnamese can appear (stacked diacritics)', () => {
    // 3xl and 4xl are the big percent readouts (digits only).
    for (const size of ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl']) {
      expect(Number(decl(tokensCss, `--text-${size}--line-height`))).toBeGreaterThanOrEqual(1.3)
    }
  })

  it('CS-ACCESSIBLE-UI: motion durations are 150–250 ms', () => {
    expect(decl(tokensCss, '--duration-fast')).toBe('150ms')
    expect(decl(tokensCss, '--duration-normal')).toBe('250ms')
  })
})

describe('base.css', () => {
  it('CS-ACCESSIBLE-UI: motion stops under prefers-reduced-motion', () => {
    expect(baseCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })

  it('CS-ACCESSIBLE-UI: the root font size follows the device setting', () => {
    expect(baseCss).toMatch(/html\s*\{[^}]*font-size:\s*100%/)
  })

  it('CS-ACCESSIBLE-UI: links in running text are underlined, not colour-only (WCAG 1.4.1)', () => {
    expect(baseCss).toMatch(/a:not\(\[class\]\)\s*\{[^}]*text-decoration:\s*underline/)
  })

  it('CS-ACCESSIBLE-UI: focus rings are drawn by us with the focus token', () => {
    expect(baseCss).toMatch(/:focus-visible[^{]*\{[^}]*var\(--focus\)/)
  })
})

// Phase 0 spike, removed by roadmap 7.0.3; not part of the design system.
const SPIKE = /\/features\/diagnostics\//
const sources = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('components', () => {
  it('CS-TOKENS: no hard-coded hex colours or Tailwind palette classes', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !SPIKE.test(path))
      .filter(([, src]) =>
        /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/.test(
          src,
        ),
      )
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
