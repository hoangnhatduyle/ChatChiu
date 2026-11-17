// NC-AU-NO-TOKEN-STORAGE-LEAK (critical): tokens are never logged, put in URLs, or stored anywhere
// except the Supabase client's own storage. A static scan of core/ keeps that true as 4.2+ land.
const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Source without whole-line comments, so prose doesn't trip the scans. */
const code = (src: string) =>
  src
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/?\*)/.test(line))
    .join('\n')

describe('NC-AU-NO-TOKEN-STORAGE-LEAK', () => {
  it('has sources to scan', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
  })

  it('T-SPEC-AU-001-NC-NC_AU_NO_TOKEN_STORAGE_LEAK: core/ never logs, and never touches web storage or cookies itself', () => {
    const forbidden = [
      /\bconsole\.\w+\s*\(/,
      /\b(?:localStorage|sessionStorage|indexedDB)\b/,
      /\bdocument\.cookie\b/,
    ]
    const offenders = Object.entries(sources).flatMap(([path, src]) =>
      forbidden.filter((re) => re.test(code(src))).map((re) => `${path} ${re}`),
    )
    expect(offenders).toEqual([])
  })

  it('T-SPEC-AU-001-NC-NC_AU_NO_TOKEN_STORAGE_LEAK: no token or session value is placed in a URL or router state', () => {
    const offenders = Object.entries(sources).filter(([, src]) =>
      /(?:navigate|Navigate|redirect|history\.\w+)[^\n]*(?:access_token|refresh_token|session\b)/.test(
        code(src),
      ),
    )
    expect(offenders.map(([p]) => p)).toEqual([])
  })
})
