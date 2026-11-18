// A real HTTP server for the built app (dist/) that forwards /api/** to the API test server. Browser
// specs normally route /api through Playwright (context.route), but Playwright cannot answer a request
// that a page makes while it is being unloaded, so the keepalive checks (roadmap 7.0.21c) need an API
// the browser can really reach.
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { extname, join, normalize } from 'node:path'

const DIST = join(import.meta.dirname, '..', '..', 'dist')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const SKIPPED_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding'])

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

export type AppServer = { url: string; close: () => Promise<void> }

export async function startAppServer(apiBaseUrl: string): Promise<AppServer> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://local').pathname
      if (path.startsWith('/api/')) {
        const headers = Object.fromEntries(
          Object.entries(req.headers).filter(
            ([name, value]) => !SKIPPED_HEADERS.has(name) && typeof value === 'string',
          ),
        ) as Record<string, string>
        const body =
          req.method === 'GET' || req.method === 'HEAD'
            ? undefined
            : new Uint8Array(await readBody(req))
        const upstream = await fetch(`${apiBaseUrl}${req.url}`, {
          method: req.method,
          headers,
          body,
        })
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
        res.end(Buffer.from(await upstream.arrayBuffer()))
        return
      }
      const file = join(DIST, normalize(path).replace(/^(\.\.[/\\])+/, ''))
      try {
        const data = await readFile(file)
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.end(data)
      } catch {
        // Single-page app: any other path is the shell.
        res.setHeader('Content-Type', TYPES['.html']!)
        res.end(await readFile(join(DIST, 'index.html')))
      }
    })().catch((error: unknown) => {
      process.stderr.write(`app server error: ${String(error)}\n`)
      if (!res.headersSent) res.statusCode = 502
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
