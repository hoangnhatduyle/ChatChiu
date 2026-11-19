// How API and network failures are classified and worded (step 4.2). The server's error codes come
// from packages/contracts (ApiErrorCode); the client adds four of its own for failures that never
// reach the server. Data hooks (4.4) branch on `kind`, toasts (4.5) show `userMessage`.
import type { ApiErrorCode } from '@chatchiu/contracts'

/** Failures that happen before there is a server answer, or an answer we cannot read. */
export type LocalErrorCode = 'NETWORK' | 'TIMEOUT' | 'AUTH_UNAVAILABLE' | 'BAD_RESPONSE' | 'UNKNOWN'
export type ClientErrorCode = ApiErrorCode | LocalErrorCode

/** What the failure means for the app, whatever its code or status. */
export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'invalid'
  | 'rate-limited'
  | 'quota'
  | 'server'
  | 'bad-response'
  | 'unknown'
  | 'offline'
  | 'timeout'
  | 'auth-unavailable'

const KIND_BY_CODE: Record<ApiErrorCode, ApiErrorKind> = {
  BAD_REQUEST: 'invalid',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not-found',
  METHOD_NOT_ALLOWED: 'invalid',
  CONFLICT: 'conflict',
  PAYLOAD_TOO_LARGE: 'invalid',
  UNSUPPORTED_MEDIA_TYPE: 'invalid',
  RATE_LIMITED: 'rate-limited',
  QUOTA_EXCEEDED: 'quota',
  INTERNAL: 'server',
}

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_CLIENT_ERROR = 400
const HTTP_SERVER_ERROR = 500
/** Gateway answers that mean "try the same request again shortly". */
const TRANSIENT_GATEWAY_STATUSES: readonly number[] = [502, 503, 504]

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(KIND_BY_CODE, value)
}

/** Status alone: used when the body is not our envelope. A status below 400 means a success we cannot read. */
function kindFromStatus(status: number): ApiErrorKind {
  if (status === HTTP_UNAUTHORIZED) return 'unauthorized'
  if (status === HTTP_FORBIDDEN) return 'forbidden'
  if (status === HTTP_NOT_FOUND) return 'not-found'
  if (status === HTTP_CONFLICT) return 'conflict'
  if (status === HTTP_TOO_MANY_REQUESTS) return 'rate-limited'
  if (status >= HTTP_SERVER_ERROR) return 'server'
  if (status >= HTTP_CLIENT_ERROR) return 'invalid'
  return 'bad-response'
}

function deriveKind(code: ClientErrorCode, status: number): ApiErrorKind {
  switch (code) {
    case 'NETWORK':
      return 'offline'
    case 'TIMEOUT':
      return 'timeout'
    case 'AUTH_UNAVAILABLE':
      return 'auth-unavailable'
    case 'UNKNOWN':
      return 'unknown'
    case 'BAD_RESPONSE':
      return kindFromStatus(status)
    default:
      // The status wins for 5xx, so an odd upstream cannot make a server fault look like our 4xx.
      return status >= HTTP_SERVER_ERROR ? 'server' : KIND_BY_CODE[code]
  }
}

/**
 * Could the server have applied the request even though we got no usable answer? True for a timeout,
 * a dropped connection, an unreadable 2xx and any 5xx. A replay of such a request can duplicate a
 * write unless the server dedupes it (decision for step 4.3).
 */
function defaultOutcomeUnknown(code: ClientErrorCode, status: number): boolean {
  if (code === 'NETWORK' || code === 'TIMEOUT' || code === 'UNKNOWN') return true
  if (code === 'AUTH_UNAVAILABLE') return false
  return status >= HTTP_SERVER_ERROR || (code === 'BAD_RESPONSE' && status < HTTP_CLIENT_ERROR)
}

export type ApiClientErrorInit = {
  status: number
  code: ClientErrorCode
  message: string
  details?: unknown
  existingId?: number
  /** Overrides the default guess about whether the server applied the request. */
  outcomeUnknown?: boolean
  /** How long the server asked us to wait (Retry-After), in ms. */
  retryAfterMs?: number
  /** The lower-level error, kept for diagnosis (never shown to her). */
  cause?: unknown
}

export class ApiClientError extends Error {
  /** HTTP status, or 0 when there was no answer. */
  readonly status: number
  readonly code: ClientErrorCode
  readonly kind: ApiErrorKind
  /** Server details, present outside production only. */
  readonly details?: unknown
  /** Meal-slot 409 only (AC-API-12): the plan already in that slot. */
  readonly existingId?: number

  /** True when the server may have applied the request although we got no usable answer. */
  readonly outcomeUnknown: boolean
  readonly retryAfterMs?: number

  constructor({
    status,
    code,
    message,
    details,
    existingId,
    outcomeUnknown,
    retryAfterMs,
    cause,
  }: ApiClientErrorInit) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.kind = deriveKind(code, status)
    this.details = details
    this.existingId = existingId
    this.outcomeUnknown = outcomeUnknown ?? defaultOutcomeUnknown(code, status)
    this.retryAfterMs = retryAfterMs
  }
}

const SNIPPET_LENGTH = 200

/** A short, printable piece of an unreadable body, for diagnosis. */
export function snippet(text: string): string {
  return stripControl(text).slice(0, SNIPPET_LENGTH)
}

function stripControl(text: string): string {
  return [...text].filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f).join('')
}

/** The envelope's `error` object, if `body` really is one (NC-API-ENVELOPE). The code may be one we do not know yet. */
function readEnvelopeError(body: unknown) {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null
  const error: unknown = body.error
  if (typeof error !== 'object' || error === null) return null
  const { code, message, details, existingId } = error as Record<string, unknown>
  if (typeof code !== 'string' || typeof message !== 'string') return null
  return {
    code,
    message,
    details,
    existingId: typeof existingId === 'number' ? existingId : undefined,
  }
}

export type ResponseExtras = { retryAfterMs?: number; hint?: string }

/**
 * An error response: the envelope when it is one, otherwise classified by status alone (a gateway page,
 * say). A code we do not know (a newer server than this cached app) keeps the server's message and is
 * classified by status.
 */
export function fromResponse(
  status: number,
  body: unknown,
  extras: ResponseExtras = {},
): ApiClientError {
  const error = readEnvelopeError(body)
  const { retryAfterMs } = extras
  if (error && isApiErrorCode(error.code)) {
    return new ApiClientError({ status, ...error, code: error.code, retryAfterMs })
  }
  if (error) {
    return new ApiClientError({
      status,
      code: 'BAD_RESPONSE',
      message: error.message,
      details: error.details,
      retryAfterMs,
    })
  }
  return new ApiClientError({
    status,
    code: 'BAD_RESPONSE',
    message: `The server answered ${status} without a readable error.`,
    details: extras.hint,
    retryAfterMs,
  })
}

export function networkError(cause?: unknown): ApiClientError {
  return new ApiClientError({
    status: 0,
    code: 'NETWORK',
    message: 'No connection to the server.',
    cause,
  })
}

export function timeoutError(cause?: unknown): ApiClientError {
  return new ApiClientError({
    status: 0,
    code: 'TIMEOUT',
    message: 'The server took too long to answer.',
    cause,
  })
}

/** The session could not be read or refreshed just now. No request was applied, so it is safe to try again. */
export function authUnavailableError(cause?: unknown): ApiClientError {
  return new ApiClientError({
    status: 0,
    code: 'AUTH_UNAVAILABLE',
    message: 'The session could not be read.',
    cause,
  })
}

/** A request the caller cancelled (AbortController). It is deliberately not an ApiClientError. */
export function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

/** A gateway or proxy answer (502, 503, 504): something in front of the API, not the API itself. */
export function isGatewayStatus(status: number): boolean {
  return TRANSIENT_GATEWAY_STATUSES.includes(status)
}

export function isOffline(error: unknown): boolean {
  return error instanceof ApiClientError && error.kind === 'offline'
}

/**
 * Worth trying again later as the same request: no connection, a timeout, a gateway error, a rate
 * limit, or the session being unreadable for a moment. A plain 500 is not, and 4xx answers (a monthly
 * QUOTA_EXCEEDED included) would fail again. This says the request may succeed; `outcomeUnknown` says
 * whether replaying it risks doing it twice.
 */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false
  return (
    error.kind === 'offline' ||
    error.kind === 'timeout' ||
    error.kind === 'auth-unavailable' ||
    error.code === 'RATE_LIMITED' ||
    TRANSIENT_GATEWAY_STATUSES.includes(error.status)
  )
}

const GENERIC_MESSAGE = 'Something went wrong. Try again.'
const SERVER_TEXT_LIMIT = 200

/** Server wording for a 4xx, cleaned and capped: it is shown to her, so it must stay short and printable. */
function serverText(message: string): string {
  const text = stripControl(message).trim().slice(0, SERVER_TEXT_LIMIT)
  return text || GENERIC_MESSAGE
}

/** What a browser API (the push service, the camera) says when it refuses, in plain words (7.0.32g). */
function browserErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) return GENERIC_MESSAGE
  switch (error.name) {
    case 'NotAllowedError':
      return 'This browser blocked it. Allow notifications for this site in the browser settings, then try again.'
    case 'AbortError':
      return "The browser's push service didn't answer. Try again in a moment."
    case 'InvalidStateError':
      return 'This device is in a state that cannot do that right now. Reload the app and try again.'
    case 'NotSupportedError':
      return "This browser doesn't support that."
    default:
      return GENERIC_MESSAGE
  }
}

/** Plain-language text for a toast (F-AP-03). Server wording is shown for 4xx only: a 5xx may carry internals. */
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return browserErrorMessage(error)
  switch (error.kind) {
    case 'quota':
      return "You've used this month's allowance for this feature. It resets next month."
    case 'rate-limited':
      return 'Too many requests. Wait a moment and try again.'
    case 'unauthorized':
      return 'Your session ended. Sign in again.'
    case 'offline':
      return "You're offline. Check your connection."
    case 'timeout':
      return 'That took too long. Try again.'
    case 'auth-unavailable':
      return "Couldn't check your sign-in just now. Try again."
    case 'server':
      return 'Something went wrong on our side. Try again.'
    case 'bad-response':
      return 'The server sent something unexpected. Refresh and check before trying again.'
    case 'unknown':
      return GENERIC_MESSAGE
    case 'invalid':
    case 'conflict':
    case 'not-found':
    case 'forbidden':
      return error.code === 'BAD_RESPONSE' ? GENERIC_MESSAGE : serverText(error.message)
  }
}
