import { recoveryInUrl, safeReturnPath } from './auth-paths'

describe('F-AU-05 safeReturnPath', () => {
  it('F-AU-05: keeps in-app paths', () => {
    expect(safeReturnPath('/stock?tab=a#x')).toBe('/stock?tab=a#x')
  })

  it.each([
    undefined,
    null,
    42,
    '',
    'stock',
    '//evil.example',
    'https://evil.example',
    '/\\evil',
    '/\t/evil.example',
    '/\n/evil.example',
    '/login',
    '/login/',
    '/Login',
    '/LOGIN?x=1',
    '/register',
    '/reset-password?x=1',
    '/reset-password/#a',
  ])('F-AU-05: falls back to / for %j', (value) => {
    expect(safeReturnPath(value)).toBe('/')
  })
})

describe('F-AU-03 recoveryInUrl', () => {
  it('F-AU-03: true for the fragment Supabase puts on a recovery link', () => {
    expect(recoveryInUrl('#access_token=a&refresh_token=b&type=recovery')).toBe(true)
  })

  it.each(['', '#', '#type=signup', '#access_token=a&type=magiclink', '#/recovery'])(
    'F-AU-03: false for %j',
    (hash) => {
      expect(recoveryInUrl(hash)).toBe(false)
    },
  )
})
