// Vend app: one node:http server for the gateway, the seller API, SSE and static pages.
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGateway } from './gateway/index.js'
import { emit, subscribe } from './events.js'
import { listTools, registerTool } from './registry.js'
import { packageTool as realPackageTool } from './packager/index.js'
import { createLocalRunner } from './packager/runner-local.js'
import { createCreateosRunner } from './packager/runner-createos.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const EXAMPLE_TOOL = path.join(ROOT, 'examples', 'broken_tool.py')
const DEFAULT_PORT = 8080
const MAX_CODE_BYTES = 20 * 1024
const MAX_API_BODY_BYTES = 64 * 1024
const MAX_DESCRIPTION_CHARS = 280
const MIN_PRICE_USD = 0.5
const SSE_BACKLOG = 50
const SSE_HEARTBEAT_MS = 25_000
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/
const STATIC_PAGES = { '/': 'index.html', '/sell': 'sell.html' }
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const PLACEHOLDER_BY_TYPE = { string: 'hello', number: 1, integer: 1, boolean: false, array: [], object: {} }

const sendJson = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
const httpError = (status, message) => Object.assign(new Error(message), { status })

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size <= maxBytes) return chunks.push(c)
      reject(httpError(413, 'body too large'))
      req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(httpError(400, 'body must be JSON'))
      }
    })
    req.on('error', reject)
  })
}

function originOf(req) {
  if (process.env.VEND_PUBLIC_URL) return process.env.VEND_PUBLIC_URL.replace(/\/+$/, '')
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`
}

const MAX_EXAMPLE_DEPTH = 4

// Example value for a schema: its `examples`/`default`, else a typed placeholder (recursing into objects/arrays).
function exampleValue(schema = {}, depth = 0) {
  if (schema.examples?.length) return schema.examples[0]
  if (schema.default !== undefined) return schema.default
  if (schema.enum?.length) return schema.enum[0]
  const type = [].concat(schema.type || (schema.properties ? 'object' : 'string'))[0]
  if (depth >= MAX_EXAMPLE_DEPTH) return PLACEHOLDER_BY_TYPE[type] ?? null
  if (type === 'array') return schema.items ? [exampleValue(schema.items, depth + 1)] : []
  if (type !== 'object') return PLACEHOLDER_BY_TYPE[type] ?? 'hello'
  const props = schema.properties || {}
  const keys = schema.required?.length ? schema.required : Object.keys(props).slice(0, 1)
  return Object.fromEntries(keys.map((key) => [key, exampleValue(props[key], depth + 1)]))
}

// Example request body for the buyer snippet.
export const exampleInput = (schema = {}) => exampleValue({ ...schema, type: 'object' })

const publicTool = (tool, origin) => ({
  id: tool.id,
  name: tool.name,
  description: tool.description,
  priceUsd: tool.priceUsd,
  inputSchema: tool.inputSchema,
  url: `${origin}/t/${tool.id}`,
  example: exampleInput(tool.inputSchema),
})

const cents = (n) => Math.round(n * 100)

export function computeStats(events) {
  const stats = { paidCalls: 0, okCalls: 0, failedCalls: 0, refunds: 0, blocked: 0, grossCents: 0, sellerCents: 0, vendCents: 0, refundedCents: 0 }
  for (const { type, data = {} } of events) {
    if (type === 'call.paid') (stats.paidCalls++, (stats.grossCents += cents(data.amountUsd || 0)))
    else if (type === 'call.ok') (stats.okCalls++, (stats.sellerCents += data.ledger?.sellerCents || 0), (stats.vendCents += data.ledger?.vendCents || 0))
    else if (type === 'call.failed') stats.failedCalls++
    else if (type === 'call.blocked') stats.blocked++
    else if (type === 'call.refunded') (stats.refunds++, (stats.refundedCents += cents(data.amountUsd || 0)))
  }
  return stats
}

// ponytail: re-reads the whole events log per request; fine for a demo, keep running totals if it grows.
function readAllEvents() {
  const file = path.join(process.env.VEND_DATA_DIR || 'data', 'events.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

function streamEvents(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  readAllEvents().slice(-SSE_BACKLOG).forEach(send) // from disk so history survives restarts
  const unsubscribe = subscribe(send)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), SSE_HEARTBEAT_MS)
  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}

export function validateSubmission(body) {
  const { name, description = '', code, priceUsd } = body || {}
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) return 'name must be a lowercase slug (a-z, 0-9, -), 2-40 chars'
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_CHARS) return `description must be text up to ${MAX_DESCRIPTION_CHARS} chars`
  if (typeof code !== 'string' || !code.trim()) return 'code is required'
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return 'code must be 20 KB or less'
  const price = Number(priceUsd)
  if (!Number.isFinite(price) || price < MIN_PRICE_USD || Math.abs(price * 100 - Math.round(price * 100)) > 1e-9) return 'priceUsd must be whole cents and at least 0.50'
  return null
}

function isAdmin(req, adminToken) {
  if (!adminToken) return true
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest()
  return crypto.timingSafeEqual(digest(req.headers['x-vend-admin'] || ''), digest(adminToken))
}

function defaultRunner() {
  const useLocal = process.env.VEND_RUNNER === 'local' || (!process.env.VEND_RUNNER && !process.env.CREATEOS_SANDBOX_API_KEY)
  return useLocal ? createLocalRunner() : createCreateosRunner()
}

async function runBuild(jobId, submission, { packageTool, makeRunner }) {
  const { name, description = '', code } = submission
  const priceUsd = Number(submission.priceUsd)
  const onLog = (line) => emit('build.log', { jobId, name, line: String(line) })
  try {
    const result = await packageTool({ name, description, code, priceUsd }, { onLog, runner: makeRunner() })
    if (!result.testsPassed || !result.upstreamUrl) {
      emit('build.done', { jobId, name, ok: false, attempts: result.attempts, error: 'tests did not pass' })
      return
    }
    const inputSchema = result.inputSchema || { type: 'object' }
    const tool = registerTool({ name, description, priceUsd, upstreamUrl: result.upstreamUrl, sandboxId: result.sandboxId, inputSchema })
    emit('build.done', { jobId, name, ok: true, attempts: result.attempts, toolId: tool.id, path: `/t/${tool.id}` })
  } catch (err) {
    console.error('[server] build failed', err)
    emit('build.done', { jobId, name, ok: false, error: String(err.message || err).slice(0, 300) })
  }
}

function createBuildHandler({ packageTool, makeRunner, adminToken }) {
  let running = null
  return async function submitTool(req, res) {
    if (!isAdmin(req, adminToken)) return sendJson(res, 401, { ok: false, error: 'admin token required (x-vend-admin)' })
    const body = await readJsonBody(req, MAX_API_BODY_BYTES)
    const invalid = validateSubmission(body)
    if (invalid) return sendJson(res, 400, { ok: false, error: invalid })
    if (running) return sendJson(res, 409, { ok: false, error: 'a build is running', jobId: running })
    const jobId = crypto.randomBytes(6).toString('hex')
    running = jobId
    sendJson(res, 202, { ok: true, jobId })
    runBuild(jobId, body, { packageTool, makeRunner }).finally(() => {
      running = null
    })
  }
}

function serveStatic(req, res) {
  let urlPath
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0])
  } catch {
    return sendJson(res, 404, { ok: false, error: 'not found' })
  }
  const file = path.resolve(PUBLIC_DIR, '.' + (STATIC_PAGES[urlPath] ? `/${STATIC_PAGES[urlPath]}` : urlPath))
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendJson(res, 404, { ok: false, error: 'not found' })
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

export function createApp({ gateway, packageTool = realPackageTool, makeRunner = defaultRunner, adminToken = process.env.VEND_ADMIN_TOKEN } = {}) {
  const pay = gateway || createGateway({ stripeSecretKey: process.env.STRIPE_SECRET_KEY, networkId: process.env.STRIPE_PROFILE_ID })
  const submitTool = createBuildHandler({ packageTool, makeRunner, adminToken })
  const routes = {
    'GET /api/tools': (req, res) => sendJson(res, 200, listTools().map((t) => publicTool(t, originOf(req)))),
    'GET /api/stats': (req, res) => sendJson(res, 200, computeStats(readAllEvents())),
    'GET /api/events': streamEvents,
    'GET /api/example': (req, res) => res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(fs.readFileSync(EXAMPLE_TOOL, 'utf8')),
    'GET /healthz': (req, res) => sendJson(res, 200, { ok: true }),
    'POST /api/tools': submitTool,
  }
  return async function app(req, res) {
    const pathname = req.url.split('?')[0]
    try {
      if (pathname.startsWith('/t/') || pathname === '/openapi.json') return await pay(req, res)
      const handler = routes[`${req.method} ${pathname}`]
      if (handler) return await handler(req, res)
      if (req.method === 'GET') return serveStatic(req, res)
      sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (err) {
      if (!err.status) console.error('[server] request failed', err)
      if (!res.headersSent) sendJson(res, err.status || 500, { ok: false, error: err.status ? err.message : 'server error' })
    }
  }
}

function seedDemoTool() {
  const upstreamUrl = process.env.VEND_SEED_TOOL_URL
  if (!upstreamUrl) return
  registerTool({
    id: 'chart',
    name: 'chart',
    description: 'Render a bar or line chart and return it as a base64 PNG.',
    priceUsd: MIN_PRICE_USD,
    upstreamUrl,
    inputSchema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: { type: 'array', examples: [[{ label: 'Jul', value: 120 }, { label: 'Aug', value: 180 }, { label: 'Sep', value: 260 }]] },
        title: { type: 'string', examples: ['Revenue'] },
        kind: { type: 'string', examples: ['bar'] },
      },
    },
  })
  console.log(`seeded demo tool "chart" → ${upstreamUrl}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile?.()
  } catch {
    // no .env: rely on the real environment (e.g. on CreateOS)
  }
  if (!process.env.STRIPE_SECRET_KEY) console.log('OWNER NEEDED: STRIPE_SECRET_KEY (test mode) — set it in .env locally or via `createos env` on the deploy')
  seedDemoTool()
  const port = Number(process.env.PORT || DEFAULT_PORT)
  http.createServer(createApp()).listen(port, () => console.log(`Vend on http://localhost:${port}`))
}
