// Step 4.2: the API client against a fake fetch (no network). SPEC-API-001 AC-API-01, AC-API-04,
// NC-API-ENVELOPE; SPEC-AU-001 F-AU-04 (401 -> silent refresh -> retry once); SPEC-AP-001 F-AP-01.
import { vi } from 'vitest'
import { createApiClient } from './api-client'
import type { RefreshOutcome } from './auth-actions'
import { ApiClientError, isAbort, isOffline } from './errors'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function setup(overrides: Parameters<typeof createApiClient>[0] = {}) {
  const fetchMock = vi.fn<typeof fetch>()
  const getToken = vi.fn(() => Promise.resolve<string | null>('tok-1'))
  const onUnauthorized = vi.fn<(failedToken: string) => Promise<RefreshOutcome>>(() =>
    Promise.resolve('expired'),
  )
  const api = createApiClient({
    baseUrl: '',
    fetch: fetchMock,
    getToken,
    onUnauthorized,
    ...overrides,
  })
  return { api, fetchMock, getToken, onUnauthorized }
}
/** Headers arrive, then the body never does, until the request is aborted. */
function hangingBody(init: RequestInit | undefined): Response {
  const text = () =>
    new Promise<string>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      )
    })
  return {
    status: 200,
    ok: true,
    type: 'basic',
    headers: new Headers(),
    text,
  } as unknown as Response
}
const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name)
const urlOf = (call: unknown[]) => String(call[0])

describe('success', () => {
  it('AC-API-01: unwraps { data } and attaches the bearer token', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: { id: 7 } }))
    await expect(api.get<{ id: number }>('/api/inventory/7')).resolves.toEqual({ id: 7 })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('/api/inventory/7')
    expect(init?.method).toBe('GET')
    expect(headerOf(init, 'Authorization')).toBe('Bearer tok-1')
  })

  it('AC-API-01: a null payload is a valid success', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: null }))
    await expect(api.get('/api/x')).resolves.toBeNull()
  })

  it('sends JSON bodies with a content type, and none on GET or DELETE', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { data: {} })))
    await api.post('/api/inventory', { name: 'Milk' })
    await api.patch('/api/inventory/1', { quantity: 2 })
    await api.delete('/api/inventory/1')
    await api.get('/api/inventory')
    const [post, patch, del, get] = fetchMock.mock.calls.map((c) => c[1])
    expect(post?.body).toBe('{"name":"Milk"}')
    expect(headerOf(post, 'Content-Type')).toBe('application/json')
    expect(patch?.method).toBe('PATCH')
    expect(del?.body).toBeUndefined()
    expect(get?.body).toBeUndefined()
  })

  it('builds the query string and skips null and undefined', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: [] }))
    await api.get('/api/waste', {
      query: { from: '2026-01-01', limit: 5, flag: false, none: undefined, nil: null },
    })
    expect(urlOf(fetchMock.mock.calls[0] ?? [])).toBe(
      '/api/waste?from=2026-01-01&limit=5&flag=false',
    )
  })

  it('joins a configured base URL without a double slash', async () => {
    const { api, fetchMock } = setup({ baseUrl: 'http://localhost:3000/' })
    fetchMock.mockResolvedValue(json(200, { data: 1 }))
    await api.get('/api/health')
    expect(urlOf(fetchMock.mock.calls[0] ?? [])).toBe('http://localhost:3000/api/health')
  })

  it('passes keepalive through (undo flush on pagehide, step 4.5)', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: null }))
    await api.delete('/api/inventory/1', { keepalive: true })
    expect(fetchMock.mock.calls[0]?.[1]?.keepalive).toBe(true)
  })
})

describe('the token goes only to our own API', () => {
  it.each([
    'https://evil.example/api/x',
    '//evil.example/api/x',
    'api/x',
    '/\\evil.example',
    '/api/../../x',
    '',
  ])(
    'NC-AU-NO-TOKEN-STORAGE-LEAK: refuses the path %j before any request or token read',
    async (path) => {
      const { api, fetchMock, getToken } = setup()
      await expect(api.get(path)).rejects.toBeInstanceOf(Error)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(getToken).not.toHaveBeenCalled()
    },
  )
})

describe('failures', () => {
  it('NC-API-ENVELOPE: throws an ApiClientError from { error: { code, message } }', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(
      json(409, { error: { code: 'CONFLICT', message: 'slot taken', existingId: 9 } }),
    )
    const err = await api.post('/api/meal-plans', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiClientError)
    expect(err).toMatchObject({ status: 409, code: 'CONFLICT', kind: 'conflict', existingId: 9 })
  })

  it('AC-API-21: a 429 QUOTA_EXCEEDED is kind "quota"', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(
      json(429, { error: { code: 'QUOTA_EXCEEDED', message: 'used up' } }),
    )
    await expect(api.post('/api/ai/receipt-scan', {})).rejects.toMatchObject({ kind: 'quota' })
  })

  it('NC-API-ENVELOPE: a 200 that is not { data } is a bad response, not a silent undefined', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { items: [] }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('NC-API-ENVELOPE: an error page that is not JSON is classified by its status', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 502, kind: 'server' })
  })

  it('F-AP-01: a failed fetch (no connection) is an offline error', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await api.get('/api/x').catch((e: unknown) => e)
    expect(isOffline(err)).toBe(true)
  })

  it('a caller abort stays an AbortError (not reported as offline)', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const controller = new AbortController()
    const pending = api.get('/api/x', { signal: controller.signal }).catch((e: unknown) => e)
    controller.abort()
    const err = await pending
    expect(err).toBeInstanceOf(DOMException)
    expect((err as DOMException).name).toBe('AbortError')
  })

  it('a request that takes longer than the timeout fails with a timeout error', async () => {
    const { api, fetchMock } = setup({ timeoutMs: 20 })
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
  })

  it('F-AU-04: when the session cannot be read right now, no request is sent and the error is transient', async () => {
    const { api, fetchMock, getToken } = setup()
    getToken.mockRejectedValue(new Error('lock timeout'))
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('401 handling (AC-API-04, F-AU-04)', () => {
  it('AC-API-04: with no session it fails with 401 and sends nothing', async () => {
    const { api, fetchMock, getToken, onUnauthorized } = setup()
    getToken.mockResolvedValue(null)
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 401, kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('F-AU-04: a 401 asks for a refresh with the failed token, then retries once with the new token', async () => {
    const { api, fetchMock, getToken, onUnauthorized } = setup()
    onUnauthorized.mockResolvedValue('refreshed')
    getToken.mockResolvedValueOnce('tok-1').mockResolvedValueOnce('tok-2')
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }))
    await expect(api.get('/api/x')).resolves.toEqual({ ok: true })
    expect(onUnauthorized).toHaveBeenCalledWith('tok-1')
    expect(headerOf(fetchMock.mock.calls[1]?.[1], 'Authorization')).toBe('Bearer tok-2')
  })

  it('F-AU-04: a second 401 after the retry ends in an unauthorized error, with no loop', async () => {
    const { api, fetchMock, onUnauthorized } = setup()
    onUnauthorized.mockResolvedValue('refreshed')
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } })),
    )
    await expect(api.get('/api/x')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('F-AU-04: when the refresh is refused (she was signed out) the request is not retried', async () => {
    const { api, fetchMock, onUnauthorized } = setup()
    onUnauthorized.mockResolvedValue('expired')
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('F-AU-04: when the refresh could not reach Supabase it is "auth unavailable" (the API answered, so not offline), and nothing was applied', async () => {
    const { api, fetchMock, onUnauthorized } = setup()
    onUnauthorized.mockResolvedValue('unreachable')
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
    const err = await api.get('/api/x').catch((e: unknown) => e)
    expect(err).toMatchObject({
      code: 'AUTH_UNAVAILABLE',
      kind: 'auth-unavailable',
      outcomeUnknown: false,
    })
    expect(isOffline(err)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('F-AU-04: a refresh that throws is "auth unavailable" too, with the cause kept', async () => {
    const { api, fetchMock, onUnauthorized } = setup()
    const cause = new Error('lock timeout')
    onUnauthorized.mockRejectedValue(cause)
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', cause })
  })

  it('F-AU-04: the retry repeats the same URL, method and body, with exactly two requests', async () => {
    const { api, fetchMock, onUnauthorized, getToken } = setup()
    onUnauthorized.mockResolvedValue('refreshed')
    getToken.mockResolvedValueOnce('tok-1').mockResolvedValueOnce('tok-2')
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { data: 1 }))
    await api.post('/api/inventory', { name: 'Milk' }, { query: { a: 1 } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [first, second] = fetchMock.mock.calls
    expect(String(second?.[0])).toBe(String(first?.[0]))
    expect(second?.[1]?.method).toBe('POST')
    expect(second?.[1]?.body).toBe(first?.[1]?.body)
  })

  it('F-AU-04: when the session cannot be read for the retry it is "auth unavailable"', async () => {
    const { api, fetchMock, onUnauthorized, getToken } = setup()
    onUnauthorized.mockResolvedValue('refreshed')
    getToken.mockResolvedValueOnce('tok-1').mockRejectedValueOnce(new Error('lock'))
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('the whole call shares one deadline and one abort signal', () => {
  const abortWhenSignalled = (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      )
    })

  it('a timeout while the body is still arriving is a TIMEOUT, not a bad response', async () => {
    const { api, fetchMock } = setup({ timeoutMs: 20 })
    fetchMock.mockImplementation((_url, init) => Promise.resolve(hangingBody(init)))
    const err = await api.post('/api/x', {}).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'TIMEOUT', kind: 'timeout', outcomeUnknown: true })
  })

  it('a caller abort while the body is still arriving stays an AbortError', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockImplementation((_url, init) => Promise.resolve(hangingBody(init)))
    const controller = new AbortController()
    const pending = api.get('/api/x', { signal: controller.signal }).catch((e: unknown) => e)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    expect(isAbort(await pending)).toBe(true)
  })

  it('an abort while the token is being read stops before any request', async () => {
    const { api, fetchMock, getToken } = setup()
    getToken.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const pending = api.get('/api/x', { signal: controller.signal }).catch((e: unknown) => e)
    controller.abort()
    expect(isAbort(await pending)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a token read that hangs past the deadline is a TIMEOUT', async () => {
    const { api, getToken } = setup({ timeoutMs: 20 })
    getToken.mockReturnValue(new Promise(() => {}))
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('an abort while a refresh is pending stops there: no retry, and not reported as signed out', async () => {
    const { api, fetchMock, onUnauthorized } = setup()
    onUnauthorized.mockReturnValue(new Promise(() => {}))
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
    const controller = new AbortController()
    const pending = api.get('/api/x', { signal: controller.signal }).catch((e: unknown) => e)
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
    controller.abort()
    expect(isAbort(await pending)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a timeout on the retry attempt is a TIMEOUT', async () => {
    const { api, fetchMock, onUnauthorized } = setup({ timeoutMs: 30 })
    onUnauthorized.mockResolvedValue('refreshed')
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockImplementationOnce(abortWhenSignalled)
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('an already-aborted signal sends nothing', async () => {
    const { api, fetchMock } = setup()
    const controller = new AbortController()
    controller.abort()
    const err = await api.get('/api/x', { signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbort(err)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cleans up: no timer left, and the caller signal has no listener left', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: 1 }))
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    await api.get('/api/x', { signal: controller.signal })
    expect(clear).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    clear.mockRestore()
  })
})

describe('what else can go wrong', () => {
  it('a fetch TypeError is offline, with the cause kept and the outcome unknown', async () => {
    const { api, fetchMock } = setup()
    const cause = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(cause)
    await expect(api.get('/api/x')).rejects.toMatchObject({
      kind: 'offline',
      cause,
      outcomeUnknown: true,
    })
  })

  it('a connection cut while the body arrives (a TypeError) is offline with an unknown outcome', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      type: 'basic',
      headers: new Headers(),
      text: () => Promise.reject(new TypeError('network error')),
    } as unknown as Response)
    await expect(api.post('/api/x', {})).rejects.toMatchObject({
      kind: 'offline',
      outcomeUnknown: true,
    })
  })

  it('an unrecognised rejection is wrapped as UNKNOWN with its cause, not thrown raw', async () => {
    const { api, fetchMock } = setup()
    const cause = new Error('extension blocked it')
    fetchMock.mockRejectedValue(cause)
    await expect(api.get('/api/x')).rejects.toMatchObject({
      code: 'UNKNOWN',
      kind: 'unknown',
      cause,
    })
  })

  it('NC-API-ENVELOPE: invalid JSON on a 200 is a bad response that records the content type and a snippet', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(
      new Response('<html>Not JSON</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    const err = await api.post('/api/x', {}).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'BAD_RESPONSE', kind: 'bad-response', outcomeUnknown: true })
    expect((err as ApiClientError).details).toMatch(/text\/html.*Not JSON/)
  })

  it('an empty 2xx body is a bad response (the API always answers { data })', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.delete('/api/x/1')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('keeps Retry-After from a 429 (seconds)', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'slow down' } }), {
        status: 429,
        headers: { 'Retry-After': '7' },
      }),
    )
    await expect(api.get('/api/x')).rejects.toMatchObject({
      kind: 'rate-limited',
      retryAfterMs: 7000,
    })
  })
})

describe('request hygiene', () => {
  it('NC-AU-NO-TOKEN-STORAGE-LEAK: the token appears only in the Authorization header', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: null }))
    await api.post('/api/inventory', { name: 'Milk' }, { query: { a: 1 } })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).not.toContain('tok-1')
    expect(String(init?.body)).not.toContain('tok-1')
    const { Authorization, ...others } = init?.headers as Record<string, string>
    expect(Authorization).toBe('Bearer tok-1')
    expect(JSON.stringify(others)).not.toContain('tok-1')
  })

  it('NC-AU-NO-TOKEN-STORAGE-LEAK: requests send no cookies, use no cache and never follow a redirect', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: null }))
    await api.get('/api/x')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
    })
  })

  it('NC-API-ENVELOPE: a redirect answer is a bad response and is never followed or retried', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }),
    )
    await expect(api.get('/api/x')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('an opaque redirect (what redirect: "manual" yields in a browser) is a bad response', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue({
      status: 0,
      ok: false,
      type: 'opaqueredirect',
      headers: new Headers(),
    } as unknown as Response)
    await expect(api.get('/api/x')).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
      kind: 'bad-response',
    })
  })

  it('keepalive refuses a body over 60 KiB (the browser would throw a TypeError that looks like "offline")', async () => {
    const { api, fetchMock } = setup()
    await expect(
      api.post('/api/x', { text: 'x'.repeat(61 * 1024) }, { keepalive: true }),
    ).rejects.toThrow(/too large/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a body JSON cannot carry (a loop, a function) is refused locally, without a request', async () => {
    const { api, fetchMock } = setup()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    await expect(api.post('/api/x', loop)).rejects.toThrow(/cannot be sent as JSON/)
    await expect(api.post('/api/x', () => 1)).rejects.toThrow(/cannot be sent as JSON/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('idempotency key (step 4.3: a queued write is replayed with the same key)', () => {
  it('F-AP-01: sends the key as an Idempotency-Key header', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: null }))
    await api.post('/api/inventory', {}, { idempotencyKey: 'a1b2c3d4-0000-4000-8000-000000000001' })
    expect(headerOf(fetchMock.mock.calls[0]?.[1], 'Idempotency-Key')).toBe(
      'a1b2c3d4-0000-4000-8000-000000000001',
    )
  })

  it('F-AP-01: sends no such header when none is given', async () => {
    const { api, fetchMock } = setup()
    fetchMock.mockResolvedValue(json(200, { data: null }))
    await api.post('/api/inventory', {})
    expect(headerOf(fetchMock.mock.calls[0]?.[1], 'Idempotency-Key')).toBeNull()
  })

  it('F-AU-04: the retry after a 401 keeps the same key', async () => {
    const { api, fetchMock, onUnauthorized } = setup()
    onUnauthorized.mockResolvedValue('refreshed')
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, { data: 1 }))
    await api.post('/api/inventory', {}, { idempotencyKey: 'key-1' })
    expect(headerOf(fetchMock.mock.calls[1]?.[1], 'Idempotency-Key')).toBe('key-1')
  })

  it.each(['', ' ', 'a b', 'x'.repeat(101), 'bad/key', 'é'])(
    'refuses the key %j before any request',
    async (key) => {
      const { api, fetchMock } = setup()
      await expect(api.post('/api/x', {}, { idempotencyKey: key })).rejects.toThrow(
        /idempotency key/i,
      )
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})

describe('reachability reports (step 4.3)', () => {
  it('F-AP-01: an answer from our API, whatever its status, is reported reachable', async () => {
    const onReachability = vi.fn()
    const { api, fetchMock } = setup({ onReachability })
    for (const status of [200, 401, 404, 429, 500]) {
      fetchMock.mockResolvedValueOnce(
        status === 200
          ? json(200, { data: 1 })
          : json(status, { error: { code: 'INTERNAL', message: 'x' } }),
      )
      await api.get('/api/x').catch(() => undefined)
    }
    expect(onReachability).toHaveBeenCalledTimes(5)
    expect(onReachability).not.toHaveBeenCalledWith(false)
  })

  it('F-AP-01: a gateway error (502, 503, 504) or a page that is not ours (a captive portal) is not "reachable"', async () => {
    const onReachability = vi.fn()
    const { api, fetchMock } = setup({ onReachability })
    for (const status of [502, 503, 504]) {
      fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status }))
      await api.get('/api/x').catch(() => undefined)
    }
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Sign in to the Wi-Fi</html>', { status: 200 }),
    )
    await api.get('/api/x').catch(() => undefined)
    expect(onReachability).not.toHaveBeenCalled()
  })

  it('F-AP-01: a network failure is reported unreachable', async () => {
    const onReachability = vi.fn()
    const { api, fetchMock } = setup({ onReachability })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await api.get('/api/x').catch(() => undefined)
    expect(onReachability).toHaveBeenCalledWith(false)
  })

  it('F-AP-01: a timeout (Wi-Fi with no internet often hangs instead of failing) is reported unreachable', async () => {
    const onReachability = vi.fn()
    const { api, fetchMock } = setup({ onReachability, timeoutMs: 20 })
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_res, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))
        }),
    )
    await api.get('/api/x').catch(() => undefined)
    expect(onReachability).toHaveBeenCalledWith(false)
  })

  it('a caller abort says nothing about reachability', async () => {
    const onReachability = vi.fn()
    const { api, fetchMock } = setup({ onReachability })
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_res, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))
        }),
    )
    const controller = new AbortController()
    const pending = api.get('/api/x', { signal: controller.signal }).catch(() => undefined)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    await pending
    expect(onReachability).not.toHaveBeenCalled()
  })

  it('a callback that throws never breaks the request', async () => {
    const { api, fetchMock } = setup({
      onReachability: () => {
        throw new Error('listener bug')
      },
    })
    fetchMock.mockResolvedValue(json(200, { data: 7 }))
    await expect(api.get('/api/x')).resolves.toBe(7)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.get('/api/x')).rejects.toMatchObject({ kind: 'offline' })
  })
})
