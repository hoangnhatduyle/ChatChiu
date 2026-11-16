// Fails when the initial JS (scripts referenced by index.html + their static imports) exceeds the
// gzip budget in docs/plan/architecture.md §5. Per-route budgets are added in roadmap step 6.1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'apps/web/dist'
const INITIAL_JS_BUDGET_KB = 150

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const entries = [...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map((m) => m[1])
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g)].map(
  (m) => m[1],
)
const files = [...new Set([...entries, ...preloads])]

if (files.length === 0) {
  console.error('No entry scripts found in dist/index.html. Run the build first.')
  process.exit(1)
}

let totalKb = 0
for (const file of files) {
  const kb = gzipSync(readFileSync(join(DIST, file))).length / 1024
  totalKb += kb
  console.log(`${file.padEnd(40)} ${kb.toFixed(1)} KB gz`)
}
console.log(`Initial JS: ${totalKb.toFixed(1)} KB gz (budget ${INITIAL_JS_BUDGET_KB} KB)`)

if (totalKb > INITIAL_JS_BUDGET_KB) {
  console.error('Initial JS bundle is over budget.')
  process.exit(1)
}
