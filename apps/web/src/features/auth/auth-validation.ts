// Form checks for the auth pages, as pure functions: each returns one message per bad field, or {}.
// The server still decides (NC-AU-NO-WEAK-PASSWORD is enforced again in core/auth-actions.ts).
import { MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, normaliseUsername } from '../../core/auth-rules'

export type FieldErrors<Key extends string> = Partial<Record<Key, string>>

const WEAK_PASSWORD = `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`
const MISMATCH = 'The passwords do not match.'
const EMAIL_SHAPE = /^\S+@\S+\.\S+$/

function emailError(email: string): string | undefined {
  if (email.trim() === '') return 'Enter your email.'
  return EMAIL_SHAPE.test(email.trim())
    ? undefined
    : 'Enter an email address like name@example.com.'
}

function passwordPairErrors(
  password: string,
  confirm: string,
): FieldErrors<'password' | 'confirm'> {
  const errors: FieldErrors<'password' | 'confirm'> = {}
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = WEAK_PASSWORD
  if (confirm !== password) errors.confirm = MISMATCH
  return errors
}

export function validateLogin(values: {
  email: string
  password: string
}): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {}
  const email = emailError(values.email)
  if (email) errors.email = email
  if (values.password === '') errors.password = 'Enter your password.'
  return errors
}

export function validateEmailOnly(email: string): FieldErrors<'email'> {
  const message = emailError(email)
  return message ? { email: message } : {}
}

export function validateRegister(values: {
  username: string
  email: string
  password: string
  confirm: string
}): FieldErrors<'username' | 'email' | 'password' | 'confirm'> {
  const errors: FieldErrors<'username' | 'email' | 'password' | 'confirm'> = {}
  if (normaliseUsername(values.username) === null) {
    errors.username =
      values.username.trim() === ''
        ? 'Choose a username.'
        : `Use a username of up to ${MAX_USERNAME_LENGTH} characters.`
  }
  const email = emailError(values.email)
  if (email) errors.email = email
  return { ...errors, ...passwordPairErrors(values.password, values.confirm) }
}

export function validateNewPassword(values: {
  password: string
  confirm: string
}): FieldErrors<'password' | 'confirm'> {
  return passwordPairErrors(values.password, values.confirm)
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0
}

/** Moves focus to the first field the user has to fix (WCAG 3.3.1), after the errors are on screen. */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => {
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  })
}
