// Bundle budget gate (architecture.md §5, SPEC-AP-001 NC-AP-BUDGET), run in CI after the build:
// - initial JS = the entry chunk, its static imports, library chunks it loads lazily at start
//   (node_modules, e.g. workbox-window) and the board route <= 185 KB gzipped (raised 175 -> 185 for the UI refresh, user decision 2026-11-19; raised 150 -> 170 in step 5.1, 170 -> 200 in step 5.6 by the user; trimmed to 175 in step 6.1);
// - every other lazy route (its chunk + static imports not already loaded) <= 120 KB gzipped;
// - the dev-only component gallery (apps/web/ui-gallery.html, step 3.2) must never ship.
// Sizes come from the Vite build manifest (apps/web/dist/.vite/manifest.json). JS only, as the
// budgets in architecture.md §5 are JS budgets; CSS (about 8 KB gz) is not counted.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export const INITIAL_JS_BUDGET_KB = 185
export const ROUTE_JS_BUDGET_KB = 120
/**
 * Libraries the app loads only after the first paint (a dynamic import started once the user is signed in), or only inside
 * the Fire shell (the Capacitor plugins, step 5.9: a browser never fetches them).
 */
export const AFTER_FIRST_PAINT_LIBRARIES = [
  'node_modules/@supabase/realtime-js/',
  'node_modules/@capacitor/',
  'node_modules/@capgo/',
]
export const AFTER_FIRST_PAINT_BUDGET_KB = 30
/**
 * The board route's own module: the page routes.tsx lazy-loads for "/". A test checks this against
 * routes.tsx and shell/pages.ts, so it cannot go stale when step 5.1 swaps in the board.
 */
export const BOARD_ROUTE = 'src/features/kitchen-board/KitchenBoardPage.tsx'

const DIST = fileURLToPath(new URL('../apps/web/dist/', import.meta.url))
const BYTES_PER_KB = 1024

/** Every chunk key reachable from `key` through static imports, `key` included. */
function staticClosure(manifest, key, seen = new Set()) {
  if (seen.has(key)) return seen
  if (!manifest[key]) throw new Error(`The build manifest has no entry for ${key}.`)
  seen.add(key)
  for (const dep of manifest[key].imports ?? []) staticClosure(manifest, dep, seen)
  return seen
}

const isLibrary = (key) => key.includes('node_modules/')
const isAfterFirstPaint = (key) => AFTER_FIRST_PAINT_LIBRARIES.some((lib) => key.includes(lib))

/**
 * @param {Record<string, {file: string, isEntry?: boolean, isDynamicEntry?: boolean, imports?: string[]}>} manifest
 * @param {(file: string) => number} gzipBytes gzipped size of an emitted file
 * @param {{ board: string }} options
 */
export function measureBudgets(manifest, gzipBytes, { board }) {
  const failures = []
  const kbOf = (keys) =>
    [...keys].reduce((sum, k) => sum + gzipBytes(manifest[k].file), 0) / BYTES_PER_KB

  const entries = Object.keys(manifest).filter((k) => manifest[k].isEntry)
  const initial = new Set()
  for (const e of entries) staticClosure(manifest, e, initial)
  // Libraries the app imports lazily at start (not pages) load on every visit.
  for (const k of Object.keys(manifest)) {
    if (manifest[k].isDynamicEntry && isLibrary(k) && !isAfterFirstPaint(k)) {
      staticClosure(manifest, k, initial)
    }
  }
  if (manifest[board]) staticClosure(manifest, board, initial)
  else failures.push(`Board route ${board} not found in the build manifest; update BOARD_ROUTE.`)

  const initialKb = kbOf(initial)
  if (initialKb > INITIAL_JS_BUDGET_KB) {
    failures.push(
      `Initial JS (shell + board) is ${initialKb.toFixed(1)} KB gz, over the ${INITIAL_JS_BUDGET_KB} KB budget.`,
    )
  }

  const afterBoot = Object.keys(manifest)
    .filter((k) => manifest[k].isDynamicEntry && isAfterFirstPaint(k))
    .map((key) => ({
      key,
      kb: kbOf([...staticClosure(manifest, key)].filter((k) => !initial.has(k))),
    }))
  for (const a of afterBoot) {
    if (a.kb > AFTER_FIRST_PAINT_BUDGET_KB) {
      failures.push(
        `Library ${a.key} (loaded after first paint) is ${a.kb.toFixed(1)} KB gz, over its ${AFTER_FIRST_PAINT_BUDGET_KB} KB cap.`,
      )
    }
  }

  const routes = Object.keys(manifest)
    .filter((k) => manifest[k].isDynamicEntry && k !== board && !isLibrary(k))
    .map((key) => {
      const own = [...staticClosure(manifest, key)].filter((k) => !initial.has(k))
      return { key, kb: kbOf(own) }
    })
  for (const r of routes) {
    if (r.kb > ROUTE_JS_BUDGET_KB) {
      failures.push(
        `Lazy route ${r.key} is ${r.kb.toFixed(1)} KB gz, over the ${ROUTE_JS_BUDGET_KB} KB budget.`,
      )
    }
  }
  return { initialKb, routes, afterBoot, failures }
}

function main() {
  const manifestPath = join(DIST, '.vite/manifest.json')
  if (!existsSync(manifestPath)) {
    console.error('No build manifest. Run the build first (vite build with build.manifest: true).')
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  const galleryLeaks = [
    ...(existsSync(join(DIST, 'ui-gallery.html')) ? ['ui-gallery.html'] : []),
    ...Object.keys(manifest).filter((k) => /ui-gallery/i.test(k)),
  ]
  if (galleryLeaks.length > 0) {
    console.error(`The dev-only UI gallery is in the production build: ${galleryLeaks.join(', ')}`)
    process.exit(1)
  }

  const gzipBytes = (file) => gzipSync(readFileSync(join(DIST, file))).length
  const { initialKb, routes, afterBoot, failures } = measureBudgets(manifest, gzipBytes, {
    board: BOARD_ROUTE,
  })

  console.log(
    `Initial JS (shell + board): ${initialKb.toFixed(1)} KB gz (budget ${INITIAL_JS_BUDGET_KB} KB)`,
  )
  for (const a of afterBoot) {
    console.log(
      `  after first paint ${a.key.slice(-40).padEnd(30)} ${a.kb.toFixed(1)} KB gz (cap ${AFTER_FIRST_PAINT_BUDGET_KB} KB)`,
    )
  }
  for (const r of routes) {
    console.log(
      `  lazy ${r.key.padEnd(48)} ${r.kb.toFixed(1)} KB gz (budget ${ROUTE_JS_BUDGET_KB} KB)`,
    )
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`✗ ${f}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
