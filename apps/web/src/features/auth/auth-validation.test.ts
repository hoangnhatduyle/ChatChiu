// SPEC-AU-001 form checks (F-AU-01, F-AU-02, F-AU-03, NC-AU-NO-WEAK-PASSWORD).
import {
  hasErrors,
  validateEmailOnly,
  validateLogin,
  validateNewPassword,
  validateRegister,
} from './auth-validation'

const PASSWORD = 'correct-horse-battery'

describe('validateLogin', () => {
  it('F-AU-01: asks for both fields when they are empty', () => {
    expect(validateLogin({ email: ' ', password: '' })).toEqual({
      email: 'Enter your email.',
      password: 'Enter your password.',
    })
  })
  it('F-AU-01: accepts an email and a password of any length (the server judges the password)', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({})
  })
  it('F-AU-01: rejects an address with no @ or no dot', () => {
    expect(validateLogin({ email: 'a-b.co', password: 'x' }).email).toMatch(/like name@/)
    expect(validateLogin({ email: 'a@b', password: 'x' }).email).toMatch(/like name@/)
  })
})

describe('validateRegister', () => {
  const ok = { username: 'Chiu', email: 'a@b.co', password: PASSWORD, confirm: PASSWORD }
  it('F-AU-02: a complete, matching form has no errors', () => {
    expect(validateRegister(ok)).toEqual({})
  })
  it('F-AU-02: a blank username (spaces only) is refused', () => {
    expect(validateRegister({ ...ok, username: '   ' }).username).toBe('Choose a username.')
  })
  it('F-AU-02: a username over the limit is refused', () => {
    expect(validateRegister({ ...ok, username: 'x'.repeat(41) }).username).toMatch(/up to 40/)
  })
  it('NC-AU-NO-WEAK-PASSWORD: 11 characters is refused, 12 is accepted', () => {
    expect(
      validateRegister({ ...ok, password: 'x'.repeat(11), confirm: 'x'.repeat(11) }).password,
    ).toMatch(/at least 12/)
    expect(validateRegister({ ...ok, password: 'x'.repeat(12), confirm: 'x'.repeat(12) })).toEqual(
      {},
    )
  })
  it('F-AU-02: a different confirmation is refused on the confirmation field', () => {
    expect(validateRegister({ ...ok, confirm: PASSWORD + '!' })).toEqual({
      confirm: 'The passwords do not match.',
    })
  })
})

describe('validateNewPassword and helpers', () => {
  it('F-AU-03: the reset form needs 12+ characters that match', () => {
    expect(validateNewPassword({ password: 'short', confirm: 'other' })).toEqual({
      password: expect.stringMatching(/at least 12/),
      confirm: expect.stringMatching(/do not match/),
    })
    expect(validateNewPassword({ password: PASSWORD, confirm: PASSWORD })).toEqual({})
  })
  it('F-AU-03: the forgot form needs a plausible email', () => {
    expect(validateEmailOnly('')).toEqual({ email: 'Enter your email.' })
    expect(validateEmailOnly('a@b.co')).toEqual({})
  })
  it('hasErrors tells an empty result from a failing one', () => {
    expect(hasErrors({})).toBe(false)
    expect(hasErrors({ email: 'x' })).toBe(true)
  })
})
