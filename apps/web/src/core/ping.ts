// The reachability probe: an unauthenticated GET /api/health (no token, no cookies). Lives in core/
// because only core/ may call fetch (AR-NO-DIRECT-API).
const PING_TIMEOUT_MS = 5_000
const HEALTH_PATH = '/api/health'

export type PingOptions = { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number }

/** True when the API answers 2xx within the timeout. Never throws. */
export async function pingApi({
  fetch: doFetch = (...args) => fetch(...args),
  baseUrl = '',
  timeoutMs = PING_TIMEOUT_MS,
}: PingOptions = {}): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await doFetch(`${baseUrl.replace(/\/+$/, '')}${HEALTH_PATH}`, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
    })
    return response.ok
  } catch {
    return false // offline, timed out, blocked: all mean "not reachable right now"
  } finally {
    clearTimeout(timer)
  }
}
