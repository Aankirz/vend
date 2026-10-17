import { NodeListener } from 'mppx/server'
import { getTool, listTools } from '../registry.js'
import { emit } from '../events.js'
import { createStripePayments } from './payments.js'
import { validateInput } from './validate.js'

const VEND_FEE_RATE = 0.1
const UPSTREAM_TIMEOUT_MS = 30_000
const MAX_BODY_BYTES = 1_000_000
const ROUTE = /^\/t\/([^/?#]+)\/?(?:\?.*)?$/

const json = (status, body) => Response.json(body, { status })

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) reject(Object.assign(new Error('body too large'), { status: 413 }))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function toFetchRequest(req) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  return new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers })
}

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
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: `upstream HTTP ${res.status}` }
    if (!body || body.ok === false) return { ok: false, error: body?.error || 'upstream returned no result' }
    return { ok: true, body }
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'upstream timed out' : `upstream unreachable: ${err.message}` }
  }
}

async function refundFailedCall(payments, tool, paymentIntent, error) {
  emit('call.failed', { toolId: tool.id, paymentIntent, error })
  try {
    const refund = await payments.refund(paymentIntent)
    emit('call.refunded', { toolId: tool.id, paymentIntent, refundId: refund.id, amountUsd: tool.priceUsd })
    return json(502, { ok: false, error, refunded: true, refundId: refund.id, message: `Tool failed; your $${tool.priceUsd.toFixed(2)} payment was refunded.` })
  } catch (err) {
    console.error('[gateway] refund failed', paymentIntent, err)
    emit('call.failed', { toolId: tool.id, paymentIntent, error: `refund failed: ${err.message}` })
    return json(502, { ok: false, error, refunded: false, paymentIntent, message: 'Tool failed and the automatic refund did not go through; contact Vend with this paymentIntent.' })
  }
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

  const paymentIntent = payment.receipt.reference
  emit('call.paid', { toolId: tool.id, paymentIntent, amountUsd: tool.priceUsd })
  const upstream = await callUpstream(tool, input)
  if (!upstream.ok) return payment.withReceipt(await refundFailedCall(payments, tool, paymentIntent, upstream.error))

  emit('call.ok', { toolId: tool.id, paymentIntent, ledger: ledgerSplit(tool.priceUsd) })
  return payment.withReceipt(json(200, upstream.body))
}

// Returns a node:http (req, res) handler for POST /t/:id (and GET /openapi.json discovery).
export function createGateway({ stripeSecretKey, networkId, payments } = {}) {
  const pay = payments || createStripePayments({ stripeSecretKey, networkId })
  return async function gateway(req, res) {
    if (req.method === 'GET' && req.url.split('?')[0] === '/openapi.json') {
      return NodeListener.sendResponse(res, Response.json(pay.openapi(listTools())))
    }
    const match = ROUTE.exec(req.url)
    const tool = match && getTool(decodeURIComponent(match[1]))
    let response
    if (!tool) response = json(404, { ok: false, error: 'unknown tool' })
    else if (req.method !== 'POST') response = json(405, { ok: false, error: 'use POST' })
    else {
      try {
        response = await handlePaidCall(pay, tool, req)
      } catch (err) {
        console.error('[gateway] call failed', err)
        response = json(500, { ok: false, error: 'gateway error' })
      }
    }
    await NodeListener.sendResponse(res, response)
  }
}
