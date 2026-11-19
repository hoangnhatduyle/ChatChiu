// Applies supabase/post-cutover/*.sql to the LOCAL Supabase stack (never to a remote database). These files are the
// security hardening that cannot be a migration while the old app is live (see the header of each file). The API
// integration tests call this in their global setup, so they run against the hardened database; run it by hand after
// `supabase start` to make the browser e2e run against the same.
//
// It uses `supabase db query` and, if the CLI cannot reach Postgres over TCP (it cannot from some sandboxes), the
// database container's own psql.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = fileURLToPath(new URL('../supabase/post-cutover/', import.meta.url))
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_chatchiu'

export function applyPostCutover() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const path = join(DIR, file)
    try {
      execFileSync('npx', ['supabase', 'db', 'query', '--file', path], { cwd: ROOT, stdio: 'pipe' })
    } catch {
      execFileSync(
        'docker',
        ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        {
          input: readFileSync(path),
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
    }
    process.stdout.write(`applied ${file}\n`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) applyPostCutover()
