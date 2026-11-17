// AR-LAYERS / AR-NO-DIRECT-API: ui/ and shell/ are presentational, and features/ reaches data only
// through the data/ hooks (4.4). None of them import the API client or the Supabase client, and
// none calls fetch. ui/ and shell/ additionally never import data/ (features/ may).
const sources = import.meta.glob<string>(
  [
    '../ui/**/*.{ts,tsx}',
    '../shell/**/*.{ts,tsx}',
    '../features/**/*.{ts,tsx}',
    '!../**/*.test.{ts,tsx}',
    // Dev-only Phase 0 spike, deleted by roadmap 7.0.3; it talks to its own /api/diagnostics.
    '!../features/diagnostics/**',
  ],
  { query: '?raw', import: 'default', eager: true },
)

const FORBIDDEN = [
  /from\s+['"][^'"]*core\/api-client/,
  /from\s+['"][^'"]*core\/supabase/,
  /from\s+['"]@supabase\//,
  /\bfetch\s*\(/,
]
// features/ is the one presentational-side layer allowed to use data/ hooks.
const FORBIDDEN_OUTSIDE_FEATURES = [/from\s+['"][^'"]*\/data\//]

describe('presentational layers', () => {
  it('AR-NO-DIRECT-API: nothing in ui/, shell/ or features/ imports the API or Supabase (ui/ and shell/ also not data/) or calls fetch', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    const offenders = Object.entries(sources).flatMap(([path, src]) => {
      const rules = path.includes('/features/')
        ? FORBIDDEN
        : [...FORBIDDEN, ...FORBIDDEN_OUTSIDE_FEATURES]
      return rules.filter((re) => re.test(src)).map((re) => `${path} ${re}`)
    })
    expect(offenders).toEqual([])
  })
})
