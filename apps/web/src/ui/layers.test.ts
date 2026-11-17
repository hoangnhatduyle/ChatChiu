// AR-LAYERS / AR-NO-DIRECT-API: ui/ and shell/ are presentational. They never import the API
// client, the Supabase client or the data layer, and never call fetch.
const sources = import.meta.glob<string>(
  ['../ui/**/*.{ts,tsx}', '../shell/**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
)

const FORBIDDEN = [
  /from\s+['"][^'"]*core\/api-client/,
  /from\s+['"][^'"]*core\/supabase/,
  /from\s+['"][^'"]*\/data\//,
  /from\s+['"]@supabase\//,
  /\bfetch\s*\(/,
]

describe('presentational layers', () => {
  it('AR-NO-DIRECT-API: nothing in ui/ or shell/ imports the API, Supabase, data/ or calls fetch', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    const offenders = Object.entries(sources).flatMap(([path, src]) =>
      FORBIDDEN.filter((re) => re.test(src)).map((re) => `${path} ${re}`),
    )
    expect(offenders).toEqual([])
  })
})
