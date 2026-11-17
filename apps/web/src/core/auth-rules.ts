// Account rules shared by the actions (auth-actions.ts) and the forms (features/auth), apart from
// the Supabase client so that screens can use them without importing it.

/** NC-AU-NO-WEAK-PASSWORD, and the same minimum the Supabase project enforces. */
export const MIN_PASSWORD_LENGTH = 12
/** Longest username she can register with (stored as user_metadata.username, F-AU-02). */
export const MAX_USERNAME_LENGTH = 40

/** The username as stored: surrounding spaces removed. Empty or too long means it is not accepted. */
export function normaliseUsername(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.length > MAX_USERNAME_LENGTH ? null : trimmed
}
