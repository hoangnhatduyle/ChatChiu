// The unauthenticated reachability probe (GET /api/health). Only core/ may call fetch.
import { vi } from 'vitest'
import { pingApi } from './ping'

describe('pingApi', () => {
  it('F-AP-01: is true when /api/health answers 2xx, with no token and no cookies', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    )
    await expect(pingApi({ fetch: fetchMock, baseUrl: 'http://x/' })).resolves.toBe(true)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('http://x/api/health')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'manual' })
  })

  it('trims any number of trailing slashes from the base URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    )
    await pingApi({ fetch: fetchMock, baseUrl: 'http://x///' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://x/api/health')
  })

  it('F-AP-01: is false for a failed fetch, a timeout and a non-2xx answer', async () => {
    await expect(pingApi({ fetch: () => Promise.reject(new TypeError('x')) })).resolves.toBe(false)
    await expect(
      pingApi({ fetch: () => Promise.resolve(new Response('', { status: 503 })) }),
    ).resolves.toBe(false)
    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))
      })
    await expect(pingApi({ fetch: hang, timeoutMs: 20 })).resolves.toBe(false)
  })
})
