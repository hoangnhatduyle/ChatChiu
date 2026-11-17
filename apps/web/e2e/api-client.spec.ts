// Step 4.2 against the real API router and local Supabase, in Node: the web client (core/api-client.ts)
// talks over HTTP to a tiny server that hands each request to api/handler.ts, with real tokens. This
// checks the envelope, the 401 path and the error mapping against the actual server, not a fake.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { createApiClient } from '../src/core/api-client'
import { ApiClientError } from '../src/core/errors'
import { createAccount, signInRest } from './support/supabase'

// The AI quota is 0 for the whole run (playwright.config.ts), so the AI routes answer QUOTA_EXCEEDED
// before any OpenAI call (SPEC-API-001 NC-API-AI-QUOTA-FIRST).

let server: Server
let baseUrl = ''
let requestsSeen = 0

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? (JSON.parse(text) as unknown) : undefined
}

// A variable path, so this program's typecheck does not pull api/ in under the web app's settings.
const HANDLER_PATH = '../../../api/handler'
type Handler = (req: never, res: never) => Promise<unknown>

/** Adapts node:http to the VercelRequest / VercelResponse subset the router uses. */
async function serve(req: IncomingMessage, res: ServerResponse) {
  const { default: dispatch } = (await import(HANDLER_PATH)) as { default: Handler }
  const url = new URL(req.url ?? '/', 'http://local')
  const adapted = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: {
      ...Object.fromEntries(url.searchParams),
      __path: url.pathname.replace(/^\/api\//, ''),
    },
    body: await readBody(req),
  }
  const out = {
    get headersSent() {
      return res.headersSent
    },
    setHeader: (name: string, value: string) => (res.setHeader(name, value), out),
    status: (code: number) => ((res.statusCode = code), out),
    json: (payload: unknown) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
      return out
    },
    end: () => (res.end(), out),
  }
  await dispatch(adapted as never, out as never)
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    requestsSeen += 1
    serve(req, res).catch((error: unknown) => {
      // Say what failed: a bare 500 would hide the cause of a broken run.
      process.stderr.write(`api-client.spec server error: ${String(error)}\n`)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address !== 'object' || address === null)
    throw new Error('The test server has no address')
  baseUrl = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
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
  const before = requestsSeen
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
  expect(requestsSeen - before).toBe(2) // the rejected one, then the retry
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
