// While the old app is live, migrations from 0012 on must be additive only (migration-cutover.md,
// principle 2). Fails on DROP, RENAME or ALTER ... TYPE. 0001-0011 are verbatim copies and exempt.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const FIRST_GUARDED = 12
const FORBIDDEN = [
  {
    name: 'DROP',
    re: /\bdrop\s+(table|column|function|view|index|type|policy|trigger|schema|constraint)\b/i,
  },
  { name: 'RENAME', re: /\brename\s+(to|column|constraint)\b/i },
  { name: 'ALTER ... TYPE', re: /\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i },
]

const stripComments = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const violations = []
for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  const number = Number.parseInt(file, 10)
  if (!Number.isFinite(number) || number < FIRST_GUARDED) continue
  const sql = stripComments(readFileSync(join(DIR, file), 'utf8'))
  for (const { name, re } of FORBIDDEN) {
    if (re.test(sql)) violations.push(`${file}: contains ${name}`)
  }
}

if (violations.length > 0) {
  console.error('Non-additive migrations found (the old app shares this database):')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log(`Additive-only check passed (migrations >= ${String(FIRST_GUARDED).padStart(4, '0')}).`)
