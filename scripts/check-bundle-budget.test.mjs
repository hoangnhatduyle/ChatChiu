// Step 3.3: initial JS (shell + board route) <= 150 KB gz, each lazy route <= 120 KB gz
// (architecture.md §5, NC-AP-BUDGET), measured from the Vite build manifest.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BOARD_ROUTE,
  INITIAL_JS_BUDGET_KB,
  measureBudgets,
  ROUTE_JS_BUDGET_KB,
} from './check-bundle-budget.mjs'

const KB = 1024
const manifest = {
  'index.html': {
    file: 'assets/index.js',
    isEntry: true,
    imports: ['_vendor.js'],
    dynamicImports: ['src/board/Board.tsx', 'src/stock/Stock.tsx', 'src/meals/Meals.tsx'],
  },
  '_vendor.js': { file: 'assets/vendor.js' },
  '_charts.js': { file: 'assets/charts.js' },
  'src/board/Board.tsx': { file: 'assets/board.js', isDynamicEntry: true, imports: ['_vendor.js'] },
  'src/stock/Stock.tsx': { file: 'assets/stock.js', isDynamicEntry: true, imports: ['_vendor.js'] },
  'src/meals/Meals.tsx': {
    file: 'assets/meals.js',
    isDynamicEntry: true,
    imports: ['_vendor.js', '_charts.js'],
  },
}

describe('measureBudgets', () => {
  const sizes = {
    'assets/index.js': 20 * KB,
    'assets/vendor.js': 60 * KB,
    'assets/board.js': 30 * KB,
    'assets/stock.js': 10 * KB,
    'assets/meals.js': 50 * KB,
    'assets/charts.js': 80 * KB,
  }
  const run = (board = 'src/board/Board.tsx') =>
    measureBudgets(manifest, (file) => sizes[file] ?? 0, { board })

  it('NC-AP-BUDGET: initial JS is the entry, its static imports and the board route', () => {
    expect(run().initialKb).toBe(110)
  })

  it('NC-AP-BUDGET: a lazy route counts its own chunk and imports not already loaded', () => {
    const routes = Object.fromEntries(run().routes.map((r) => [r.key, r.kb]))
    expect(routes).toEqual({ 'src/stock/Stock.tsx': 10, 'src/meals/Meals.tsx': 130 })
  })

  it(`NC-AP-BUDGET: fails a lazy route over ${ROUTE_JS_BUDGET_KB} KB and names it`, () => {
    const failures = run().failures
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/src\/meals\/Meals\.tsx.*130\.0 KB.*120 KB/)
  })

  it(`NC-AP-BUDGET: fails initial JS over ${INITIAL_JS_BUDGET_KB} KB`, () => {
    const big = measureBudgets(manifest, (f) => (f === 'assets/board.js' ? 200 * KB : 0), {
      board: 'src/board/Board.tsx',
    })
    expect(big.failures.some((f) => /Initial JS/.test(f))).toBe(true)
  })

  it('NC-AP-BUDGET: a lazy library chunk (node_modules) loads at start, so it counts as initial, not as a route', () => {
    const withLib = {
      ...manifest,
      'index.html': {
        ...manifest['index.html'],
        dynamicImports: [...manifest['index.html'].dynamicImports, '../../node_modules/lib/x.mjs'],
      },
      '../../node_modules/lib/x.mjs': { file: 'assets/lib.js', isDynamicEntry: true },
    }
    const result = measureBudgets(
      withLib,
      (f) => (f === 'assets/lib.js' ? 5 * KB : (sizes[f] ?? 0)),
      {
        board: 'src/board/Board.tsx',
      },
    )
    expect(result.initialKb).toBe(115)
    expect(result.routes.map((r) => r.key)).not.toContain('../../node_modules/lib/x.mjs')
  })

  it('NC-AP-BUDGET: a module imported both statically and lazily is initial, so its route costs 0', () => {
    const both = {
      ...manifest,
      'index.html': { ...manifest['index.html'], imports: ['_vendor.js', 'src/stock/Stock.tsx'] },
    }
    const stock = measureBudgets(both, (f) => sizes[f] ?? 0, { board: 'src/board/Board.tsx' })
    expect(stock.routes.find((r) => r.key === 'src/stock/Stock.tsx')?.kb).toBe(0)
  })

  it('NC-AP-BUDGET: a chunk the manifest does not list fails instead of being skipped', () => {
    const dangling = {
      ...manifest,
      'src/stock/Stock.tsx': { ...manifest['src/stock/Stock.tsx'], imports: ['_missing.js'] },
    }
    expect(() =>
      measureBudgets(dangling, (f) => sizes[f] ?? 0, { board: 'src/board/Board.tsx' }),
    ).toThrow(/_missing\.js/)
  })

  it('NC-AP-BUDGET: fails loudly when the board route is not in the manifest (a renamed page cannot skip the check)', () => {
    expect(run('src/gone/Board.tsx').failures.some((f) => /board route.*not found/i.test(f))).toBe(
      true,
    )
  })
})

describe('BOARD_ROUTE', () => {
  it('NC-AP-BUDGET: is the module routes.tsx lazy-loads for "/" (so the board is always in initial JS)', () => {
    const routes = readFileSync('apps/web/src/routes.tsx', 'utf8')
    const pages = readFileSync('apps/web/src/shell/pages.ts', 'utf8')
    const indexComponent = routes.match(/index: true,\s*element: <(\w+)/)?.[1]
    expect(indexComponent).toBeDefined()
    const lazyPath = pages.match(
      new RegExp(
        `export const ${indexComponent} = lazy\\(\\(\\) => import\\('\\./([\\w/]+)'\\)\\)`,
      ),
    )?.[1]
    expect(`src/shell/${lazyPath}.tsx`).toBe(BOARD_ROUTE)
  })

  it('NC-AP-BUDGET: no other route uses the board module (a shared chunk would hide the board)', () => {
    const routes = readFileSync('apps/web/src/routes.tsx', 'utf8')
    const indexComponent = routes.match(/index: true,\s*element: <(\w+)/)?.[1]
    expect(routes.match(new RegExp(`<${indexComponent}\\b`, 'g'))).toHaveLength(1)
  })
})
