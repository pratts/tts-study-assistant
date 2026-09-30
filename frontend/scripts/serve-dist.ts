/**
 * Serves dist/ the way Vercel does for the production e2e run: static files
 * first, SPA fallback to index.html, and the headers from vercel.json. Only
 * the CSP connect-src is changed, to point at the local API.
 *
 *   VITE_API_BASE_URL=http://localhost:3000/api/v1 node scripts/serve-dist.ts
 */
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

type HeaderRule = { source: string; headers: { key: string; value: string }[] }

const root = path.resolve(import.meta.dirname, '../dist')
const port = Number(process.env.PORT ?? 4173)
const apiOrigin = new URL(process.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1').origin
const vercel = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../vercel.json'), 'utf8')) as { headers: HeaderRule[] }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
}

// Vercel sources like "/(.*)" or "/assets/(.*)" as anchored regexes.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rules = vercel.headers.map((rule) => ({
  test: new RegExp('^' + rule.source.split('(.*)').map(escape).join('.*') + '$'),
  headers: rule.headers,
}))

function headersFor(pathname: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rule of rules) {
    if (!rule.test.test(pathname)) continue
    for (const { key, value } of rule.headers) {
      out[key] =
        key.toLowerCase() === 'content-security-policy'
          ? value.replace(/connect-src [^;]+/, `connect-src 'self' ${apiOrigin}`)
          : value
    }
  }
  return out
}

async function resolveFile(pathname: string): Promise<string> {
  const candidate = path.resolve(root, '.' + decodeURIComponent(pathname))
  if (candidate.startsWith(root + path.sep)) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      // not a file: fall through to the SPA rewrite
    }
  }
  return path.join(root, 'index.html')
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  try {
    const file = await resolveFile(pathname)
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', ...headersFor(pathname) })
    res.end(body)
  } catch (err) {
    res.writeHead(500).end(String(err))
  }
}).listen(port, 'localhost', () => {
  console.log(`serving dist/ on http://localhost:${port} (connect-src → ${apiOrigin})`)
})
