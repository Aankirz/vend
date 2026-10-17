// Vend app: one node:http server for the gateway, the seller API, SSE and static pages.
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGateway } from './gateway/index.js'
import { emit, subscribe } from './events.js'
import { getTool, listTools, registerTool } from './registry.js'
import { evilInput, tryPaidCall } from './demo-buyer.js'
import { createBuyerFetch } from '../scripts/buyer.js'
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
const TRY_MAX_BODY_BYTES = 4 * 1024
const TRY_TIMEOUT_MS = 30_000
const TRY_PER_IP_MS = 10_000
const TRY_GLOBAL_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000
const MAX_TRACKED_IPS = 5000
const MAX_SCHEMA_BYTES = 16 * 1024
const DEFAULT_SCHEMA = { type: 'object' }
const URL_PATTERN = /https?:\/\/\S+/g
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

// Example request body for the buyer snippet; a malformed schema yields {} instead of a 500.
export function exampleInput(schema = {}) {
  try {
    return exampleValue({ ...schema, type: 'object' })
  } catch {
    return {}
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// LLM-written schemas are untrusted: keep only well-formed, bounded ones.
export function sanitizeSchema(schema) {
  if (!isPlainObject(schema)) return DEFAULT_SCHEMA
  if (schema.required !== undefined && !(Array.isArray(schema.required) && schema.required.every((k) => typeof k === 'string'))) return DEFAULT_SCHEMA
  if (schema.properties !== undefined && !isPlainObject(schema.properties)) return DEFAULT_SCHEMA
  if (JSON.stringify(schema).length > MAX_SCHEMA_BYTES) return DEFAULT_SCHEMA
  return schema
}

// One sandbox serves one tool, so only the newest tool per sandbox is live.
export function liveTools(tools) {
  const newest = new Map()
  for (const tool of tools) {
    const current = tool.sandboxId && newest.get(tool.sandboxId)
    if (tool.sandboxId && (!current || tool.createdAt > current.createdAt)) newest.set(tool.sandboxId, tool)
  }
  return tools.filter((tool) => !tool.sandboxId || newest.get(tool.sandboxId) === tool)
}

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

const emptyStats = () => ({ paidCalls: 0, okCalls: 0, failedCalls: 0, refunds: 0, blocked: 0, grossCents: 0, sellerCents: 0, vendCents: 0, refundedCents: 0 })

// Folds one event into running totals (mutates the accumulator it is given).
function applyEvent(stats, { type, data = {} }) {
  if (type === 'call.paid') (stats.paidCalls++, (stats.grossCents += cents(data.amountUsd || 0)))
  else if (type === 'call.ok') (stats.okCalls++, (stats.sellerCents += data.ledger?.sellerCents || 0), (stats.vendCents += data.ledger?.vendCents || 0))
  else if (type === 'call.failed') stats.failedCalls++
  else if (type === 'call.blocked') stats.blocked++
  else if (type === 'call.refunded') (stats.refunds++, (stats.refundedCents += cents(data.amountUsd || 0)))
  return stats
}

export const computeStats = (events) => events.reduce(applyEvent, emptyStats())

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

// Reads events.jsonl once, then keeps stats and the SSE backlog current from the event bus.
function createHistory() {
  const events = readAllEvents()
  const stats = computeStats(events)
  const tail = events.slice(-SSE_BACKLOG)
  subscribe((event) => {
    applyEvent(stats, event)
    tail.push(event)
    if (tail.length > SSE_BACKLOG) tail.shift()
  })
  return { stats: () => ({ ...stats }), tail: () => [...tail] }
}

function streamEvents(history, req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
  history.tail().forEach(send)
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
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest()
  return crypto.timingSafeEqual(digest(req.headers['x-vend-admin'] || ''), digest(adminToken))
}

// Seller code only ever runs on the host when VEND_RUNNER=local is set explicitly.
function makeDefaultRunner(runnerMode) {
  return runnerMode === 'local' ? createLocalRunner() : createCreateosRunner()
}

// Returns [status, error] when builds must be refused, else null.
function buildRefusal(req, { runnerMode, sandboxKey, adminToken }) {
  const isLocal = runnerMode === 'local'
  if (!isLocal && !adminToken) return [403, 'builds disabled: set VEND_ADMIN_TOKEN']
  if (adminToken && !isAdmin(req, adminToken)) return [401, 'admin token required (x-vend-admin)']
  if (!isLocal && !sandboxKey) return [503, 'builds disabled: CREATEOS_SANDBOX_API_KEY is not set (VEND_RUNNER=local only for local dev)']
  return null
}

async function runBuild(jobId, submission, { packageTool, makeRunner }) {
  const { name, description = '', code } = submission
  const priceUsd = Number(submission.priceUsd)
  // Sandbox URLs stay private: buyers must go through the gateway.
  const onLog = (line) => emit('build.log', { jobId, name, line: String(line).replace(URL_PATTERN, '[hidden]') })
  const runner = makeRunner()
  let result
  try {
    result = await packageTool({ name, description, code, priceUsd }, { onLog, runner })
  } catch (err) {
    console.error('[server] build failed', err)
    emit('build.done', { jobId, name, ok: false, error: String(err.message || err).replace(URL_PATTERN, '[hidden]').slice(0, 300) })
    return
  }
  if (!result.testsPassed || !result.upstreamUrl) {
    emit('build.done', { jobId, name, ok: false, attempts: result.attempts, error: 'tests did not pass' })
    return
  }
  try {
    const tool = registerTool({ name, description, priceUsd, upstreamUrl: result.upstreamUrl, sandboxId: result.sandboxId, inputSchema: sanitizeSchema(result.inputSchema) })
    emit('build.done', { jobId, name, ok: true, attempts: result.attempts, toolId: tool.id, path: `/t/${tool.id}` })
  } catch (err) {
    console.error('[server] register failed; releasing sandbox', err)
    await runner.destroy?.().catch((e) => console.error('[server] sandbox release failed', e))
    emit('build.done', { jobId, name, ok: false, error: 'could not register the tool' })
  }
}

function createBuildHandler({ packageTool, makeRunner, ...guard }) {
  let running = null
  return async function submitTool(req, res) {
    const refusal = buildRefusal(req, guard)
    if (refusal) return sendJson(res, refusal[0], { ok: false, error: refusal[1] })
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

// Behind the CreateOS proxy the client is the last X-Forwarded-For hop (the one the proxy appended).
function clientIp(req) {
  const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((h) => h.trim()).filter(Boolean)
  return hops.at(-1) || req.socket.remoteAddress || 'unknown'
}

// In-memory abuse limits for demo purchases: 1 per IP per 10 s, 30 per hour overall.
function createTryLimiter(now = Date.now) {
  const lastByIp = new Map()
  let recentCalls = []
  return function refuse(ip) {
    const t = now()
    recentCalls = recentCalls.filter((at) => t - at < HOUR_MS)
    if (recentCalls.length >= TRY_GLOBAL_PER_HOUR) return 'The demo budget for this hour is used up. Try again later, or run scripts/buyer.js yourself.'
    const last = lastByIp.get(ip)
    if (last && t - last < TRY_PER_IP_MS) return `One demo call every ${TRY_PER_IP_MS / 1000} seconds, please. Try again in a moment.`
    if (lastByIp.size > MAX_TRACKED_IPS) lastByIp.clear() // ponytail: crude cap, fine for in-memory demo limits
    lastByIp.set(ip, t)
    recentCalls.push(t)
    return null
  }
}

// POST /api/try/:toolId: Vend buys from its own gateway with a test SPT so anyone can watch 402 → pay → result.
function createTryHandler({ stripeSecretKey, makeBuyerFetch }) {
  const refuse = createTryLimiter()
  return async function tryTool(req, res, toolId) {
    if (!stripeSecretKey?.startsWith('sk_test_')) return sendJson(res, 503, { ok: false, error: 'demo purchases are disabled: the server has no Stripe test key' })
    const tool = getTool(toolId)
    if (!tool) return sendJson(res, 404, { ok: false, error: 'unknown tool' })
    const body = await readJsonBody(req, TRY_MAX_BODY_BYTES)
    if (!isPlainObject(body)) return sendJson(res, 400, { ok: false, error: 'body must be a JSON object' })
    const { evil, ...custom } = body
    const example = exampleInput(tool.inputSchema)
    const input = evil === true ? evilInput(tool, example) : Object.keys(custom).length ? custom : example
    const refusal = refuse(clientIp(req))
    if (refusal) return sendJson(res, 429, { ok: false, error: refusal })
    const url = `http://127.0.0.1:${req.socket.localPort}/t/${encodeURIComponent(tool.id)}`
    try {
      const out = await tryPaidCall({ url, input, timeoutMs: TRY_TIMEOUT_MS, makeBuyerFetch: (log) => makeBuyerFetch(stripeSecretKey, log) })
      sendJson(res, 200, { ok: true, ...out })
    } catch (err) {
      const timedOut = err.name === 'TimeoutError'
      if (!timedOut) console.error('[server] demo purchase failed', err)
      sendJson(res, timedOut ? 504 : 502, { ok: false, error: timedOut ? 'the demo call timed out after 30 s' : 'the demo purchase failed' })
    }
  }
}

function tryToolId(pathname) {
  try {
    return decodeURIComponent(pathname.slice('/api/try/'.length))
  } catch {
    return ''
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

export function createApp({
  gateway,
  packageTool = realPackageTool,
  runnerMode = process.env.VEND_RUNNER,
  sandboxKey = process.env.CREATEOS_SANDBOX_API_KEY,
  makeRunner = () => makeDefaultRunner(runnerMode),
  adminToken = process.env.VEND_ADMIN_TOKEN,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
  makeBuyerFetch = createBuyerFetch,
} = {}) {
  const pay = gateway || createGateway({ stripeSecretKey: process.env.STRIPE_SECRET_KEY, networkId: process.env.STRIPE_PROFILE_ID })
  const submitTool = createBuildHandler({ packageTool, makeRunner, runnerMode, sandboxKey, adminToken })
  const history = createHistory()
  const tryTool = createTryHandler({ stripeSecretKey, makeBuyerFetch })
  const routes = {
    'GET /api/tools': (req, res) => sendJson(res, 200, liveTools(listTools()).map((t) => publicTool(t, originOf(req)))),
    'GET /api/stats': (req, res) => sendJson(res, 200, history.stats()),
    'GET /api/events': (req, res) => streamEvents(history, req, res),
    'GET /api/example': (req, res) => res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(fs.readFileSync(EXAMPLE_TOOL, 'utf8')),
    'GET /healthz': (req, res) => sendJson(res, 200, { ok: true }),
    'POST /api/tools': submitTool,
  }
  return async function app(req, res) {
    const pathname = req.url.split('?')[0]
    try {
      if (pathname.startsWith('/t/') || pathname === '/openapi.json') return await pay(req, res)
      if (req.method === 'POST' && pathname.startsWith('/api/try/')) return await tryTool(req, res, tryToolId(pathname))
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
