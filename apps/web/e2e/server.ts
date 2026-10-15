import { createReadStream, existsSync, statSync } from 'node:fs'
import http, { type Server } from 'node:http'
import path from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
}
const APP_ROUTE = /^\/(app|courier|admin|provider)(?:\/|$)/

/** What nginx does in production: `/api/*` → the API; files from `dist`; `/app/*` (and the other apps) → their own index.html. */
export function startStaticServer(o: { root: string; port: number; apiPort: number }): Promise<Server> {
  const root = path.resolve(o.root)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request(
        { host: '127.0.0.1', port: o.apiPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${o.apiPort}` } },
        (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) },
      )
      upstream.on('error', () => { res.writeHead(502); res.end() })
      req.pipe(upstream)
      return
    }
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`)
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return }
    if (!(existsSync(file) && statSync(file).isFile())) {
      const app = APP_ROUTE.exec(url.pathname)
      const last = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
      if (app && !last.includes('.')) file = path.join(root, app[1], 'index.html')
      else if (url.pathname === '/') file = path.join(root, 'index.html')
      else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return }
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(o.port, '127.0.0.1', () => resolve(server))
  })
}

// Child-process entry (started by global-setup with `node server.ts`; Node strips the types).
if (process.env.E2E_STATIC_ROOT) {
  const stop = () => process.exit(0)
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  startStaticServer({ root: process.env.E2E_STATIC_ROOT, port: Number(process.env.E2E_WEB_PORT), apiPort: Number(process.env.E2E_API_PORT) })
    .then(() => console.log('static proxy listening'))
    .catch((err) => { console.error(err); process.exit(1) })
}
