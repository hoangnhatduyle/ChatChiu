// Where the guard sends her, and where she may be sent back to (F-AU-05).
export const LOGIN_PATH = '/login'
export const RESET_PASSWORD_PATH = '/reset-password'
/** Pages reachable without a session. */
export const AUTH_PATHS: readonly string[] = [LOGIN_PATH, '/register', RESET_PASSWORD_PATH]

const FALLBACK_PATH = '/'
const LAST_CONTROL_CODE = 0x1f
const DELETE_CODE = 0x7f

// The URL parser drops tabs and newlines, so "/\t/evil.example" would become "//evil.example".
function hasControlCharacter(value: string): boolean {
  return [...value].some((ch) => {
    const code = ch.charCodeAt(0)
    return code <= LAST_CONTROL_CODE || code === DELETE_CODE
  })
}

/**
 * The page to return to after signing in. Accepts only an in-app path: not another origin
 * (`//host`, `https://…`, a backslash or control-character trick) and not an auth page (that would
 * loop; the router matches case-insensitively and ignores a trailing slash, so so do we).
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return FALLBACK_PATH
  if (value.startsWith('//') || value.includes('\\') || hasControlCharacter(value)) {
    return FALLBACK_PATH
  }
  const [pathname = ''] = value.split(/[?#]/, 1)
  const normalised = pathname.toLowerCase().replace(/\/+$/, '')
  return AUTH_PATHS.includes(normalised) ? FALLBACK_PATH : value
}

/** True when the address-bar fragment is a Supabase password-recovery link (`#…&type=recovery`). */
export function recoveryInUrl(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery'
}
