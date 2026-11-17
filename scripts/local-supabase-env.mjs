// Prints the local Supabase stack's settings as KEY=VALUE lines for the web build and the e2e
// support code. Local use:  export $(node scripts/local-supabase-env.mjs | xargs)
// CI build:                 node scripts/local-supabase-env.mjs --vite >> "$GITHUB_ENV"  (no service key)
// CI e2e step:              export $(node scripts/local-supabase-env.mjs | xargs)
// Refuses anything that is not a local stack, so it can never hand out production keys.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/

export function parseStatusEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** `webOnly` leaves out the service-role key: the web build must never see it. */
export function toEnvLines(status, { webOnly = false } = {}) {
  if (!LOCAL_URL.test(status.API_URL ?? '')) {
    throw new Error(`Refusing a non-local Supabase API_URL: ${status.API_URL}`)
  }
  for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!status[key]) throw new Error(`supabase status has no ${key}; is the local stack running?`)
  }
  const web = [`VITE_SUPABASE_URL=${status.API_URL}`, `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`]
  if (webOnly) return web
  return [
    ...web,
    `SUPABASE_URL=${status.API_URL}`,
    `SUPABASE_ANON_KEY=${status.ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
  ]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const text = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const webOnly = process.argv.includes('--vite')
  console.log(toEnvLines(parseStatusEnv(text), { webOnly }).join('\n'))
}
