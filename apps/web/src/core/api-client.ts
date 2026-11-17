// The only way the web app talks to our API (AR-NO-DIRECT-API): data/ hooks call it, nothing else
// does. Attaches the Supabase token, unwraps the { data } / { error } envelope (NC-API-ENVELOPE) and
// turns every failure into an ApiClientError (core/errors.ts). Ported from OLD api-client.service.ts.
//
// One deadline and one abort signal cover the whole call: reading the token, a refresh after a 401,
// both attempts and the body read. The API always answers 200 { data } on success (never 204), so an
// empty or unreadable 2xx body is a BAD_RESPONSE.
import { getAccessToken, handleUnauthorized, type RefreshOutcome } from './auth-actions'
import {
  ApiClientError,
  authUnavailableError,
  fromResponse,
  isAbort,
  isGatewayStatus,
  networkError,
  snippet,
  timeoutError,
} from './errors'
import { getConnectivity } from './connectivity'
import { hasControlCharacter } from './path-safety'

/** A request that has not finished by now is given up on, so it cannot block the write queue behind it. */
export const REQUEST_TIMEOUT_MS = 20_000
/** Browsers refuse a keepalive request with a body over 64 KiB (the fetch spec's limit), as a TypeError. */
export const KEEPALIVE_BODY_LIMIT_BYTES = 60 * 1024
const API_PREFIX = '/api/'
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,100}$/
const HTTP_UNAUTHORIZED = 401
const MS_PER_SECOND = 1000

type QueryValue = string | number | boolean | null | undefined

export type RequestOptions = {
  query?: Record<string, QueryValue>
  signal?: AbortSignal
  /** Lets the request finish after the page is hidden (the undo flush on pagehide, step 4.5). */
  keepalive?: boolean
  timeoutMs?: number
  /**
   * Sent as `Idempotency-Key`. A write that may be replayed (the offline queue) uses one key for every
   * attempt, so the server can recognise the repeat. 1 to 100 of A-Z a-z 0-9 _ -.
   */
  idempotencyKey?: string
}

export type ApiClientDeps = {
  /** Empty = same origin. Set VITE_API_BASE_URL to reach `vercel dev` on another port. */
  baseUrl?: string
  fetch?: typeof fetch
  getToken?: () => Promise<string | null>
  onUnauthorized?: (failedToken: string) => Promise<RefreshOutcome>
  /** Told whether the server could be reached: true after any answer, false after a network failure. */
  onReachability?: (reachable: boolean) => void
  timeoutMs?: number
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type Reply = {
  status: number
  ok: boolean
  body: unknown
  retryAfterMs?: number
  /** Content type and the start of the body when it was not JSON, for diagnosis. */
  hint?: string
}

/**
 * Only a path under /api/ on our own origin: the token is attached to every request, so a path that
 * could point at another host or climb out of /api (`//host`, `https://…`, a backslash, `..`, an
 * encoded dot or slash) is a bug, not input. The query goes in `options.query`, not in the path.
 */
function isOwnPath(path: string): boolean {
  if (!path.startsWith(API_PREFIX) || path.includes('\\') || /[\s?#]/.test(path)) return false
  if (hasControlCharacter(path) || /%(2e|2f|5c)/i.test(path)) return false
  return !path.split('/').includes('..')
}

function queryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

function isSuccessBody(body: unknown): body is { data: unknown } {
  return typeof body === 'object' && body !== null && 'data' in body
}

const notSignedIn = () =>
  new ApiClientError({ status: HTTP_UNAUTHORIZED, code: 'UNAUTHORIZED', message: 'Not signed in.' })

/** A JSON body as text; throws a plain Error for a value JSON cannot carry (a loop, a BigInt, a function). */
function encodeBody(payload: unknown): string | undefined {
  if (payload === undefined) return undefined
  let text: string | undefined
  try {
    text = JSON.stringify(payload)
  } catch (error) {
    throw new Error('The request body cannot be sent as JSON.', { cause: error })
  }
  if (text === undefined) throw new Error('The request body cannot be sent as JSON.')
  return text
}

/** Retry-After as milliseconds: whole seconds, or an HTTP date. */
function retryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * MS_PER_SECOND)
  const at = Date.parse(header)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

/** One request's deadline and abort signal, shared by everything it waits on. */
function startBudget(caller: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abort = () => controller.abort()
  if (caller?.aborted) controller.abort()
  caller?.addEventListener('abort', abort, { once: true })
  const abortError = () => new DOMException('The request was aborted.', 'AbortError')

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    /** Resolves like `work`, but rejects as soon as the deadline passes or the caller aborts. */
    race<T>(work: Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (controller.signal.aborted) return reject(abortError())
        const onAbort = () => reject(abortError())
        controller.signal.addEventListener('abort', onAbort, { once: true })
        work
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener('abort', onAbort))
      })
    },
    dispose() {
      clearTimeout(timer)
      caller?.removeEventListener('abort', abort)
    },
  }
}

export function createApiClient(deps: ApiClientDeps = {}): ApiClient {
  const baseUrl = (deps.baseUrl ?? '').replace(/\/+$/, '')
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const getToken = deps.getToken ?? getAccessToken
  const onUnauthorized = deps.onUnauthorized ?? handleUnauthorized
  /** A listener's bug must never break a request. */
  const report = (reachable: boolean) => {
    try {
      deps.onReachability?.(reachable)
    } catch {
      // ignored on purpose: reachability is advisory
    }
  }

  /** The token for the next request. Signed out is a 401; an unreadable session is a transient failure. */
  async function readToken(): Promise<string> {
    let token: string | null
    try {
      token = await getToken()
    } catch (error) {
      throw authUnavailableError(error)
    }
    if (!token) throw notSignedIn()
    return token
  }

  /** Asks for a refresh after a 401; a failure of the refresh itself is "cannot check sign-in", not an expiry. */
  async function refresh(failedToken: string): Promise<RefreshOutcome> {
    try {
      return await onUnauthorized(failedToken)
    } catch (error) {
      throw authUnavailableError(error)
    }
  }

  async function send(
    method: Method,
    url: string,
    token: string,
    body: string | undefined,
    options: RequestOptions,
    signal: AbortSignal,
  ): Promise<Reply> {
    const response = await doFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.idempotencyKey !== undefined
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
      },
      body,
      keepalive: options.keepalive,
      signal,
      // The API never redirects. Following one could forward the token somewhere unintended.
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
    })
    const retryAfterMs = retryAfter(response.headers.get('Retry-After'))
    if (response.type === 'opaqueredirect') {
      return { status: 0, ok: false, body: undefined, hint: 'redirect', retryAfterMs }
    }
    // A failure while reading the body (a timeout, a dropped connection) propagates to request(), which
    // classifies it; only a body that is not JSON is turned into `undefined` here.
    const text = await response.text()
    let parsed: unknown
    let hint: string | undefined
    if (text !== '') {
      try {
        parsed = JSON.parse(text)
      } catch {
        hint = `${response.headers.get('Content-Type') ?? 'no content type'}: ${snippet(text)}`
      }
    }
    // Reachable only if it was our API that answered: JSON, and not a gateway error. A captive-portal
    // page or a 502 says nothing good about the connection.
    if (parsed !== undefined && !isGatewayStatus(response.status)) report(true)
    return { status: response.status, ok: response.ok, body: parsed, hint, retryAfterMs }
  }

  function unwrap<T>(reply: Reply): T {
    if (!reply.ok) throw fromResponse(reply.status, reply.body, reply)
    if (!isSuccessBody(reply.body)) {
      throw new ApiClientError({
        status: reply.status,
        code: 'BAD_RESPONSE',
        message: 'The server answered without { data }.',
        details: reply.hint,
      })
    }
    // The one place network data gets its type: callers name T from packages/contracts.
    return reply.body.data as T
  }

  /** Turns anything thrown while a request was in flight into the error the caller sees. */
  function classify(error: unknown, timedOut: boolean): unknown {
    if (error instanceof ApiClientError) return error
    if (timedOut) {
      report(false) // Wi-Fi with no internet often hangs rather than failing
      return timeoutError(error)
    }
    if (isAbort(error)) return error // a caller's cancel is not a failure
    if (error instanceof TypeError) {
      report(false)
      return networkError(error) // fetch's "network error" (and a cut body)
    }
    return new ApiClientError({
      status: 0,
      code: 'UNKNOWN',
      message: 'Unexpected failure.',
      cause: error,
    })
  }

  async function request<T>(
    method: Method,
    path: string,
    payload: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    if (!isOwnPath(path)) throw new Error(`API paths must be under /api/: ${path.slice(0, 40)}`)
    if (
      options.idempotencyKey !== undefined &&
      !IDEMPOTENCY_KEY_PATTERN.test(options.idempotencyKey)
    ) {
      throw new Error('The idempotency key must be 1 to 100 letters, digits, "_" or "-".')
    }
    const body = encodeBody(payload)
    if (options.keepalive && body !== undefined) {
      if (new TextEncoder().encode(body).length > KEEPALIVE_BODY_LIMIT_BYTES) {
        throw new Error('The request body is too large to send with keepalive.')
      }
    }
    const url = `${baseUrl}${path}${queryString(options.query)}`
    const budget = startBudget(
      options.signal,
      options.timeoutMs ?? deps.timeoutMs ?? REQUEST_TIMEOUT_MS,
    )
    try {
      let token = await budget.race(readToken())
      let reply = await budget.race(send(method, url, token, body, options, budget.signal))
      if (reply.status === HTTP_UNAUTHORIZED) {
        // Silent refresh first (F-AU-04); retried once, and a second 401 is final. The server
        // rejected the token before running anything, so the retry cannot repeat a write.
        const outcome = await budget.race(refresh(token))
        if (outcome === 'expired') throw notSignedIn()
        if (outcome === 'unreachable') throw authUnavailableError()
        token = await budget.race(readToken())
        reply = await budget.race(send(method, url, token, body, options, budget.signal))
      }
      return unwrap<T>(reply)
    } catch (error) {
      throw classify(error, budget.timedOut)
    } finally {
      budget.dispose()
    }
  }

  return {
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    patch: (path, body, options) => request('PATCH', path, body, options),
    delete: (path, options) => request('DELETE', path, undefined, options),
  }
}

let defaultClient: ApiClient | undefined

/** Built on first use, so importing this module reads no environment. */
function appClient(): ApiClient {
  defaultClient ??= createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    onReachability: (reachable) => {
      const connectivity = getConnectivity()
      if (reachable) connectivity.reportReachable()
      else connectivity.reportFailure()
    },
  })
  return defaultClient
}

/** The app's client: same origin by default, `VITE_API_BASE_URL` to point elsewhere in development. */
export const api: ApiClient = {
  get: (path, options) => appClient().get(path, options),
  post: (path, body, options) => appClient().post(path, body, options),
  patch: (path, body, options) => appClient().patch(path, body, options),
  delete: (path, options) => appClient().delete(path, options),
}
