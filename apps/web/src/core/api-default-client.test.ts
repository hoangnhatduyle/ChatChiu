// The app's own client (`api`) reports what it learns about the connection to core/connectivity.
import { beforeEach, vi } from 'vitest'

const connectivity = vi.hoisted(() => ({ reportReachable: vi.fn(), reportFailure: vi.fn() }))
vi.mock('./connectivity', () => ({ getConnectivity: () => connectivity }))
vi.mock('./auth-actions', () => ({
  getAccessToken: () => Promise.resolve('tok'),
  handleUnauthorized: () => Promise.resolve('expired'),
}))

import { api } from './api-client'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('the default api client', () => {
  it('F-AP-01: tells connectivity the API is reachable after an answer', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ data: 1 }), { status: 200 })),
    )
    await expect(api.get('/api/x')).resolves.toBe(1)
    expect(connectivity.reportReachable).toHaveBeenCalledTimes(1)
    expect(connectivity.reportFailure).not.toHaveBeenCalled()
  })

  it('F-AP-01: tells connectivity about a network failure', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(api.get('/api/x')).rejects.toMatchObject({ kind: 'offline' })
    expect(connectivity.reportFailure).toHaveBeenCalledTimes(1)
  })
})
