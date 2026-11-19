// Step 4.2: how API and network failures are classified and worded (SPEC-API-001 NC-API-ENVELOPE,
// AC-API-12, AC-API-21; SPEC-AP-001 F-AP-01 offline, F-AP-03 toasts).
import {
  ApiClientError,
  authUnavailableError,
  fromResponse,
  isAbort,
  isOffline,
  isTransient,
  networkError,
  timeoutError,
  userMessage,
} from './errors'

const envelope = (code: string, message = 'server words', extra: object = {}) => ({
  error: { code, message, ...extra },
})

describe('fromResponse', () => {
  it('NC-API-ENVELOPE: reads { error: { code, message } } into an ApiClientError', () => {
    const err = fromResponse(400, envelope('BAD_REQUEST', 'Invalid request body'))
    expect(err).toBeInstanceOf(ApiClientError)
    expect(err).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      kind: 'invalid',
      message: 'Invalid request body',
    })
  })

  it.each([
    [401, 'UNAUTHORIZED', 'unauthorized'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'not-found'],
    [405, 'METHOD_NOT_ALLOWED', 'invalid'],
    [409, 'CONFLICT', 'conflict'],
    [413, 'PAYLOAD_TOO_LARGE', 'invalid'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'invalid'],
    [429, 'RATE_LIMITED', 'rate-limited'],
    [429, 'QUOTA_EXCEEDED', 'quota'],
    [500, 'INTERNAL', 'server'],
  ])('NC-API-ENVELOPE: %i %s is kind "%s"', (status, code, kind) => {
    expect(fromResponse(status, envelope(code)).kind).toBe(kind)
  })

  it('AC-API-21: QUOTA_EXCEEDED and RATE_LIMITED share status 429 but are told apart by code', () => {
    expect(fromResponse(429, envelope('QUOTA_EXCEEDED')).kind).toBe('quota')
    expect(fromResponse(429, envelope('RATE_LIMITED')).kind).toBe('rate-limited')
  })

  it('AC-API-12: keeps existingId from a meal-slot 409', () => {
    expect(
      fromResponse(409, envelope('CONFLICT', 'slot taken', { existingId: 42 })).existingId,
    ).toBe(42)
  })

  it('NC-API-ENVELOPE: keeps details (sent outside production only)', () => {
    expect(fromResponse(500, envelope('INTERNAL', 'x', { details: 'boom' })).details).toBe('boom')
  })

  it('NC-API-ENVELOPE: a body that is not the envelope (a gateway HTML page) is classified by status', () => {
    const err = fromResponse(502, undefined)
    expect(err).toMatchObject({ status: 502, code: 'BAD_RESPONSE', kind: 'server' })
    expect(fromResponse(401, '<html>').kind).toBe('unauthorized')
    expect(fromResponse(429, null).kind).toBe('rate-limited')
  })

  it('NC-API-ENVELOPE: an unknown code from the server falls back to the status', () => {
    expect(fromResponse(404, envelope('SOMETHING_NEW'))).toMatchObject({
      code: 'BAD_RESPONSE',
      kind: 'not-found',
    })
  })

  it('NC-API-ENVELOPE: a malformed error object (no message) is not trusted', () => {
    expect(fromResponse(400, { error: { code: 'BAD_REQUEST' } }).code).toBe('BAD_RESPONSE')
  })
})

describe('network failures', () => {
  it('F-AP-01: networkError is offline, status 0', () => {
    const err = networkError()
    expect(err).toMatchObject({ status: 0, code: 'NETWORK', kind: 'offline' })
    expect(isOffline(err)).toBe(true)
  })

  it('timeoutError has its own kind and is not "offline"', () => {
    const err = timeoutError()
    expect(err).toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
    expect(isOffline(err)).toBe(false)
  })

  it('isOffline is false for non-errors and server errors', () => {
    expect(isOffline(new Error('x'))).toBe(false)
    expect(isOffline(fromResponse(500, undefined))).toBe(false)
    expect(isOffline('offline')).toBe(false)
  })
})

describe('outcomeUnknown (replaying could do the write twice)', () => {
  it('F-AP-01: a timeout, a dropped connection and any 5xx may have been applied', () => {
    expect(timeoutError().outcomeUnknown).toBe(true)
    expect(networkError().outcomeUnknown).toBe(true)
    for (const status of [500, 502, 503, 504]) {
      expect(fromResponse(status, undefined).outcomeUnknown).toBe(true)
    }
  })

  it('F-AP-04: a 4xx answer, a 401 and "could not read the session" were not applied', () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(fromResponse(status, undefined).outcomeUnknown).toBe(false)
    }
    expect(authUnavailableError().outcomeUnknown).toBe(false)
  })
})

describe('causes and aborts', () => {
  it('keeps the lower-level error as cause', () => {
    const cause = new TypeError('Failed to fetch')
    expect(networkError(cause).cause).toBe(cause)
    expect(timeoutError(cause).cause).toBe(cause)
    expect(authUnavailableError(cause).cause).toBe(cause)
  })

  it('isAbort recognises an AbortError and nothing else', () => {
    expect(isAbort(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isAbort(new TypeError('x'))).toBe(false)
    expect(isAbort(networkError())).toBe(false)
    expect(isAbort(undefined)).toBe(false)
  })
})

describe('isTransient (worth retrying or queueing, same request)', () => {
  it('F-AP-01: offline, timeout, 502, 503, 504 and "cannot read the session right now" are transient', () => {
    expect(isTransient(networkError())).toBe(true)
    expect(isTransient(timeoutError())).toBe(true)
    for (const status of [502, 503, 504])
      expect(isTransient(fromResponse(status, undefined))).toBe(true)
    expect(
      isTransient(new ApiClientError({ status: 0, code: 'AUTH_UNAVAILABLE', message: 'x' })),
    ).toBe(true)
  })

  it('a RATE_LIMITED 429 is transient, a monthly QUOTA_EXCEEDED is not', () => {
    expect(isTransient(fromResponse(429, envelope('RATE_LIMITED')))).toBe(true)
    expect(isTransient(fromResponse(429, envelope('QUOTA_EXCEEDED')))).toBe(false)
  })

  it('an envelope-carrying 502 or 503 is still transient', () => {
    expect(isTransient(fromResponse(502, envelope('INTERNAL')))).toBe(true)
    expect(isTransient(fromResponse(503, envelope('INTERNAL')))).toBe(true)
  })

  it('F-AP-04: 400, 401, 403, 404, 409 and a plain 500 are not (they would fail again, or may have been applied)', () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      expect(isTransient(fromResponse(status, undefined))).toBe(false)
    }
    expect(isTransient(new Error('x'))).toBe(false)
  })
})

describe('userMessage (F-AP-03 toasts)', () => {
  it('QUOTA_EXCEEDED says the monthly allowance is used', () => {
    expect(userMessage(fromResponse(429, envelope('QUOTA_EXCEEDED')))).toMatch(/month/i)
  })

  it('RATE_LIMITED asks her to wait', () => {
    expect(userMessage(fromResponse(429, envelope('RATE_LIMITED')))).toMatch(/wait|moment/i)
  })

  it('401 says the session ended', () => {
    expect(userMessage(fromResponse(401, envelope('UNAUTHORIZED')))).toMatch(/sign in|session/i)
  })

  it('F-AP-01: offline says she is offline', () => {
    expect(userMessage(networkError())).toMatch(/offline|connect/i)
  })

  it('timeout and server errors have their own wording', () => {
    expect(userMessage(timeoutError())).toMatch(/took too long|slow/i)
    expect(userMessage(fromResponse(500, envelope('INTERNAL', 'Internal server error')))).toMatch(
      /our side|wrong/i,
    )
  })

  it('NC-API-NO-LEAK: a 5xx message and details are never shown, but a 4xx server message is', () => {
    const server = fromResponse(
      500,
      envelope('INTERNAL', 'relation "x" does not exist', { details: 'SQL' }),
    )
    expect(userMessage(server)).not.toMatch(/relation|SQL/)
    expect(userMessage(fromResponse(409, envelope('CONFLICT', 'That slot is taken')))).toBe(
      'That slot is taken',
    )
  })

  it('a 4xx server message is cleaned of control characters and capped at 200 characters', () => {
    const long = `Bad\u0007 ${'x'.repeat(500)}`
    const text = userMessage(fromResponse(400, envelope('BAD_REQUEST', long)))
    expect(text.length).toBeLessThanOrEqual(200)
    expect(text).not.toContain('\u0007')
  })

  it('a 4xx without a readable envelope gets the generic message, and bad-response its own', () => {
    expect(userMessage(fromResponse(404, '<html>'))).toBe('Something went wrong. Try again.')
    expect(userMessage(fromResponse(200, undefined))).toMatch(/unexpected/i)
  })

  it('anything that is not an ApiClientError gets a generic message', () => {
    expect(userMessage(new Error('secret internals'))).not.toMatch(/secret/)
    expect(userMessage(undefined)).toBe('Something went wrong. Try again.')
  })
})

describe('7.0.32g: browser errors', () => {
  it('says what a refused permission means, not the generic text', () => {
    expect(userMessage(new DOMException('denied', 'NotAllowedError'))).toMatch(/blocked it/i)
    expect(userMessage(new DOMException('x', 'AbortError'))).toMatch(/push service/i)
  })

  it('keeps the generic text for an error it does not know', () => {
    expect(userMessage(new DOMException('x', 'DataCloneError'))).toBe(
      'Something went wrong. Try again.',
    )
    expect(userMessage(new Error('boom'))).toBe('Something went wrong. Try again.')
  })
})
