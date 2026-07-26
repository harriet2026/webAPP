'use strict'
const https = require('https')
const http = require('http')
const fs = require('fs')

const CERT = process.env.TLS_CERT || '/certs/tls.crt'
const KEY  = process.env.TLS_KEY  || '/certs/tls.key'
const HTTPS_PORT = parseInt(process.env.PORT || '443', 10)
const HTTP_PORT  = parseInt(process.env.HTTP_PORT || '80', 10)

// Fail fast if certs are missing or unreadable
let tlsOpts
try {
  tlsOpts = {
    cert: fs.readFileSync(CERT),
    key:  fs.readFileSync(KEY),
  }
} catch (e) {
  console.error(`[custom-server] TLS cert/key not readable: ${e.message}`)
  process.exit(1)
}

// HTTP redirect on port 80 — must use original http.createServer before patching
const _origCreateServer = http.createServer.bind(http)
const redirectServer = _origCreateServer((req, res) => {
  // When behind an HTTPS-terminating reverse proxy (X-Forwarded-Proto: https),
  // the client connection is already HTTPS. Redirecting to our internal HTTPS
  // port would either lose the proxy's external port or cause a redirect loop.
  // Instead, locally proxy to the HTTPS Next.js server, preserving the original
  // Host header so Next.js generates correct redirect URLs (with external port).
  if (req.headers['x-forwarded-proto'] === 'https') {
    const upstream = https.request({
      hostname: '127.0.0.1',
      port: HTTPS_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, connection: 'close' },
      rejectUnauthorized: false,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    })
    upstream.on('error', () => {
      res.writeHead(502)
      res.end('Bad Gateway')
    })
    req.pipe(upstream)
    return
  }
  const host = (req.headers.host || '').replace(/:\d+$/, '')
  const portSuffix = HTTPS_PORT === 443 ? '' : `:${HTTPS_PORT}`
  res.writeHead(301, { Location: `https://${host}${portSuffix}${req.url}` })
  res.end()
})
redirectServer.on('error', (err) => {
  console.error(`[custom-server] HTTP redirect server error: ${err.message}`)
  process.exit(1)
})
redirectServer.listen(HTTP_PORT, () => {
  console.log(`[custom-server] HTTP redirect listening on :${HTTP_PORT}`)
})

// Record the real client IP at the TLS-terminating edge. custom-server.js is
// the edge when the browser connects directly (no upstream nginx); when an
// upstream proxy is present it has already populated X-Forwarded-For. Either
// way we behave as a well-behaved proxy: append the immediate peer IP so the
// downstream /api route handler can forward it to apiserver for audit logs.
function recordClientIP (req) {
  try {
    const remote = req.socket && req.socket.remoteAddress
    if (!remote) return
    const existing = req.headers['x-forwarded-for']
    req.headers['x-forwarded-for'] = existing ? `${existing}, ${remote}` : remote
    if (!req.headers['x-real-ip']) req.headers['x-real-ip'] = remote
  } catch (_) {
    // best-effort: never block request handling on header bookkeeping
  }
}

// Monkey-patch http.createServer so Next.js standalone server.js gets HTTPS
http.createServer = function (optsOrHandler, handler) {
  const opts = typeof optsOrHandler === 'function'
    ? tlsOpts
    : { ...tlsOpts, ...optsOrHandler }
  const rawHandler = typeof optsOrHandler === 'function' ? optsOrHandler : handler
  const h = typeof rawHandler === 'function'
    ? function (req, res) { recordClientIP(req); return rawHandler(req, res) }
    : rawHandler
  return h !== undefined ? https.createServer(opts, h) : https.createServer(opts)
}

// Delegate to Next.js standalone entry point — it calls http.createServer internally
require('./server.js')
