import { NodeListener } from 'mppx/server'
import { getTool, listTools } from '../registry.js'
import { emit } from '../events.js'
import { createStripePayments } from './payments.js'
import { validateInput } from './validate.js'

const VEND_FEE_RATE = 0.1
const UPSTREAM_TIMEOUT_MS = 30_000
const MAX_BODY_BYTES = 1_000_000
// Sandbox egress denials surface as {ok:false, error:'network blocked: ...'} from the tool.
const BLOCKED_PREFIX = 'network blocked:'
const ROUTE = /^\/t\/([^/?#]+)\/?(?:\?.*)?$/

const MAX_UPSTREAM_BYTES = 1_000_000
const MAX_ERROR_CHARS = 200

const json = (status, body) => Response.json(body, { status })
const tooLarge = () => Object.assign(new Error('body too large'), { status: 413 })

// Bookkeeping must never stop a refund: a failed event write is logged, not thrown.
function record(type, data) {
  try {
    emit(type, data)
  } catch (err) {
    console.error(`[gateway] could not record ${type}`, err)
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size <= MAX_BODY_BYTES) return chunks.push(c)
      reject(tooLarge())
      req.destroy()
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readCapped(res, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of res.body ?? []) {
    size += chunk.length
    if (size > maxBytes) throw tooLarge()
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function toFetchRequest(req) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  return new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers })
}

const toolError = (body) => (typeof body?.error === 'string' ? body.error.slice(0, MAX_ERROR_CHARS) : 'tool failed')

export function ledgerSplit(priceUsd) {
  const cents = Math.round(priceUsd * 100)
  const vendCents = Math.round(cents * VEND_FEE_RATE)
  return { totalCents: cents, sellerCents: cents - vendCents, vendCents }
}

async function callUpstream(tool, input) {
  try {
    const res = await fetch(`${tool.upstreamUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      redirect: 'manual', // never follow a tool's redirect into our network (SSRF)
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (res.status >= 300 && res.status < 400) return { ok: false, error: `upstream redirected (HTTP ${res.status})` }
    const text = await readCapped(res, MAX_UPSTREAM_BYTES)
    if (!res.ok) return { ok: false, error: `upstream HTTP ${res.status}` }
    let body = null
    try {
      body = JSON.parse(text)
    } catch {}
    if (!body || typeof body !== 'object' || body.ok === false) return { ok: false, error: toolError(body) }
    return { ok: true, body }
  } catch (err) {
    if (err.name === 'TimeoutError') return { ok: false, error: 'upstream timed out' }
    if (err.status === 413) return { ok: false, error: 'upstream response too large' }
    return { ok: false, error: `upstream unreachable: ${err.message}` }
  }
}

async function refundFailedCall(payments, tool, paymentIntent, error) {
  record(error.startsWith(BLOCKED_PREFIX) ? 'call.blocked' : 'call.failed', { toolId: tool.id, paymentIntent, error })
  try {
    const refund = await payments.refund(paymentIntent)
    record('call.refunded', { toolId: tool.id, paymentIntent, refundId: refund.id, amountUsd: tool.priceUsd })
    return json(502, { ok: false, error, refunded: true, refundId: refund.id, message: `Tool failed; your $${tool.priceUsd.toFixed(2)} payment was refunded.` })
  } catch (err) {
    console.error('[gateway] refund failed', paymentIntent, err)
    record('call.refund_failed', { toolId: tool.id, paymentIntent, error: err.message })
    return json(502, { ok: false, error, refunded: false, paymentIntent, message: 'Tool failed and the automatic refund did not go through; contact Vend with this paymentIntent.' })
  }
}

// Everything after a successful charge funnels into the refund path on any failure.
async function deliverPaidCall(payments, tool, paymentIntent, input) {
  let error
  try {
    record('call.paid', { toolId: tool.id, paymentIntent, amountUsd: tool.priceUsd })
    const upstream = await callUpstream(tool, input)
    if (upstream.ok) {
      record('call.ok', { toolId: tool.id, paymentIntent, ledger: ledgerSplit(tool.priceUsd) })
      return json(200, upstream.body)
    }
    error = upstream.error
  } catch (err) {
    console.error('[gateway] failed after charge', paymentIntent, err)
    error = 'gateway error after payment'
  }
  return refundFailedCall(payments, tool, paymentIntent, error)
}

async function handlePaidCall(payments, tool, req) {
  let input
  try {
    input = JSON.parse((await readBody(req)) || '{}')
  } catch (err) {
    return json(err.status || 400, { ok: false, error: err.status ? err.message : 'body must be JSON' })
  }
  const invalid = validateInput(tool.inputSchema, input)
  if (invalid) return json(400, { ok: false, error: invalid })

  const payment = await payments.charge(tool, toFetchRequest(req))
  if (payment.status === 402) return payment.challenge
  return payment.withReceipt(await deliverPaidCall(payments, tool, payment.receipt.reference, input))
}

function findTool(url) {
  const match = ROUTE.exec(url)
  if (!match) return undefined
  try {
    return getTool(decodeURIComponent(match[1]))
  } catch {
    return undefined // malformed %-encoding
  }
}

async function route(pay, req) {
  if (req.method === 'GET' && req.url.split('?')[0] === '/openapi.json') return Response.json(pay.openapi(listTools()))
  const tool = findTool(req.url)
  if (!tool) return json(404, { ok: false, error: 'unknown tool' })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'use POST' })
  return handlePaidCall(pay, tool, req)
}

// Returns a node:http (req, res) handler for POST /t/:id (and GET /openapi.json discovery).
export function createGateway({ stripeSecretKey, networkId, payments } = {}) {
  const pay = payments || createStripePayments({ stripeSecretKey, networkId })
  return async function gateway(req, res) {
    let response
    try {
      response = await route(pay, req)
    } catch (err) {
      console.error('[gateway] request failed', err)
      response = json(500, { ok: false, error: 'gateway error' })
    }
    try {
      await NodeListener.sendResponse(res, response)
    } catch (err) {
      console.error('[gateway] could not send response', err)
      res.destroy()
    }
  }
}
