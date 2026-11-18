// A tiny HTTP server that hands each request to api/handler.ts (the real API router, against the local
// Supabase), for e2e specs that need the API: the Node client specs call it directly, browser specs
// forward the app's /api requests to it (e2e/board.spec.ts).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? (JSON.parse(text) as unknown) : undefined
}

// A variable path, so this program's typecheck does not pull api/ in under the web app's settings.
const HANDLER_PATH = '../../../../api/handler'
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

export type ApiServer = { baseUrl: string; close: () => Promise<void>; requests: () => number }

export async function startApiServer(label: string): Promise<ApiServer> {
  let requests = 0
  const server: Server = createServer((req, res) => {
    requests += 1
    serve(req, res).catch((error: unknown) => {
      // Say what failed: a bare 500 would hide the cause of a broken run.
      process.stderr.write(`${label} server error: ${String(error)}\n`)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address !== 'object' || address === null)
    throw new Error('The test server has no address')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests: () => requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
