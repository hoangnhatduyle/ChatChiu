// Step 4.2 against the real API router and local Supabase, in Node: the web client (core/api-client.ts)
// talks over HTTP to a tiny server that hands each request to api/handler.ts, with real tokens. This
// checks the envelope, the 401 path and the error mapping against the actual server, not a fake.
import { expect, test } from '@playwright/test'
import { createApiClient } from '../src/core/api-client'
import { ApiClientError } from '../src/core/errors'
import { startApiServer, type ApiServer } from './support/api-server'
import { createAccount, signInRest } from './support/supabase'

// The AI quota is 0 for the whole run (playwright.config.ts), so the AI routes answer QUOTA_EXCEEDED
// before any OpenAI call (SPEC-API-001 NC-API-AI-QUOTA-FIRST).

let apiServer: ApiServer
let baseUrl = ''

test.beforeAll(async () => {
  apiServer = await startApiServer('api-client.spec')
  baseUrl = apiServer.baseUrl
})

test.afterAll(async () => {
  await apiServer.close()
})

function clientFor(token: string) {
  return createApiClient({
    baseUrl,
    getToken: () => Promise.resolve(token),
    onUnauthorized: () => Promise.resolve('expired'),
  })
}

test('AC-API-01: reads { data } and writes through the real router', async () => {
  const user = await createAccount()
  const { access_token: token } = await signInRest(user)
  const api = clientFor(token)
  const name = `Cat ${crypto.randomUUID().slice(0, 8)}`
  const created = await api.post<{ id: number; name: string }>('/api/categories', { name })
  expect(created.name).toBe(name)
  const list = await api.get<{ id: number; name: string }[]>('/api/categories')
  expect(list.map((c) => c.id)).toContain(created.id)
})

// Local test accounts are never deleted: the stack is local and throwaway.
test('AC-API-04: a bad token is a 401 UNAUTHORIZED the client classifies as unauthorized', async () => {
  const err = await (
    await clientFor('not-a-real-token')
  )
    .get('/api/categories')
    .catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiClientError)
  expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED', kind: 'unauthorized' })
})

test('F-AU-04: a stale token, refreshed on 401, is retried once and succeeds', async () => {
  const user = await createAccount()
  const { access_token: fresh } = await signInRest(user)
  let current = 'stale-token'
  let failedToken: string | undefined
  const before = apiServer.requests()
  const api = createApiClient({
    baseUrl,
    getToken: () => Promise.resolve(current),
    onUnauthorized: (failed) => {
      failedToken = failed
      current = fresh
      return Promise.resolve('refreshed')
    },
  })
  await expect(api.get('/api/categories')).resolves.toBeInstanceOf(Array)
  expect(failedToken).toBe('stale-token')
  expect(apiServer.requests() - before).toBe(2) // the rejected one, then the retry
})

test('NC-API-ENVELOPE: a rejected body is a BAD_REQUEST the client calls invalid', async () => {
  const { access_token: token } = await signInRest(await createAccount())
  const err = await clientFor(token)
    .post('/api/categories', {})
    .catch((e: unknown) => e)
  expect(err).toMatchObject({ status: 400, code: 'BAD_REQUEST', kind: 'invalid' })
})

test('AC-API-21: an exhausted AI quota is QUOTA_EXCEEDED (kind quota), not RATE_LIMITED', async () => {
  const { access_token: token } = await signInRest(await createAccount())
  const err = await (
    await clientFor(token)
  )
    .post('/api/ai/expiration-suggest', { itemName: 'Milk' })
    .catch((e: unknown) => e)
  expect(err).toMatchObject({ status: 429, code: 'QUOTA_EXCEEDED', kind: 'quota' })
})
