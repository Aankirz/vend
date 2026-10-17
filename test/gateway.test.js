import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

process.env.VEND_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vend-gw-'))
const { registerTool } = await import('../src/registry.js')
const { recent } = await import('../src/events.js')
const { createGateway, ledgerSplit } = await import('../src/gateway/index.js')

const listen = (handler) => new Promise((resolve) => {
  const server = http.createServer(handler).listen(0, () => resolve(server))
})
const urlOf = (server) => `http://localhost:${server.address().port}`

// Stub payment boundary: "pays" whenever an Authorization header is present.
function stubPayments() {
  const calls = { charge: 0, refund: [] }
  return {
    calls,
    async charge(tool, request) {
      calls.charge++
      if (!request.headers.get('authorization')) {
        return { status: 402, challenge: new Response('{}', { status: 402, headers: { 'www-authenticate': 'Payment stub' } }) }
      }
      const withReceipt = (res) => {
        const headers = new Headers(res.headers)
        headers.set('payment-receipt', 'stub-receipt')
        return new Response(res.body, { status: res.status, headers })
      }
      return { status: 200, receipt: { reference: 'pi_stub_1' }, withReceipt }
    },
    async refund(paymentIntent) {
      calls.refund.push(paymentIntent)
      return { id: 're_stub_1' }
    },
  }
}

let upstream, upstreamMode = 'ok'
let tool
before(async () => {
  upstream = await listen(async (req, res) => {
    for await (const _ of req);
    if (upstreamMode === 'http500') return res.writeHead(500).end('boom')
    const body = upstreamMode === 'ok' ? { ok: true, result: 'HI' } : { ok: false, error: 'tool broke' }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  tool = registerTool({
    name: 'Shout', priceUsd: 0.5, upstreamUrl: urlOf(upstream),
    inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  })
})
after(() => upstream.close())

async function call(payments, id, body, headers = {}) {
  const gw = await listen(createGateway({ payments }))
  try {
    return await fetch(`${urlOf(gw)}/t/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })
  } finally {
    gw.close()
  }
}

test('unknown tool returns 404', async () => {
  const res = await call(stubPayments(), 'nope', '{}')
  assert.equal(res.status, 404)
})

test('invalid input returns 400 before any charge', async () => {
  const payments = stubPayments()
  for (const body of ['{}', '{"text":5}', 'not json', '[]']) {
    const res = await call(payments, tool.id, body, { authorization: 'Payment x' })
    assert.equal(res.status, 400, body)
  }
  assert.equal(payments.calls.charge, 0)
})

test('no credential returns an MPP 402 challenge for the tool price (real mppx)', async () => {
  const gw = await listen(createGateway({ stripeSecretKey: 'sk_test_unit' }))
  const res = await fetch(`${urlOf(gw)}/t/${tool.id}`, { method: 'POST', body: '{"text":"hi"}' })
  gw.close()
  assert.equal(res.status, 402)
  const challenge = res.headers.get('www-authenticate')
  assert.match(challenge, /^Payment /)
  assert.match(challenge, /method="stripe"/)
  const request = JSON.parse(Buffer.from(/request="([^"]+)"/.exec(challenge)[1], 'base64url'))
  assert.deepEqual([request.amount, request.currency], ['50', 'usd'])
})

test('paid call is forwarded and returns the result with a receipt', async () => {
  upstreamMode = 'ok'
  const payments = stubPayments()
  const res = await call(payments, tool.id, '{"text":"hi"}', { authorization: 'Payment x' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, result: 'HI' })
  assert.equal(res.headers.get('payment-receipt'), 'stub-receipt')
  const ok = recent(5).find((e) => e.type === 'call.ok')
  assert.deepEqual(ok.data.ledger, { totalCents: 50, sellerCents: 45, vendCents: 5 })
  assert.equal(payments.calls.refund.length, 0)
})

for (const mode of ['fail', 'http500']) {
  test(`upstream failure (${mode}) refunds the payment and returns 502`, async () => {
    upstreamMode = mode
    const payments = stubPayments()
    const res = await call(payments, tool.id, '{"text":"hi"}', { authorization: 'Payment x' })
    assert.equal(res.status, 502)
    const body = await res.json()
    assert.equal(body.refunded, true)
    assert.match(body.message, /refunded/)
    assert.deepEqual(payments.calls.refund, ['pi_stub_1'])
    const types = recent(3).map((e) => e.type)
    assert.deepEqual(types, ['call.paid', 'call.failed', 'call.refunded'])
    const logged = fs.readFileSync(path.join(process.env.VEND_DATA_DIR, 'events.jsonl'), 'utf8')
    assert.match(logged, /"call.refunded"/)
  })
}

test('ledger split is 90/10 and sums to the price', () => {
  assert.deepEqual(ledgerSplit(1.25), { totalCents: 125, sellerCents: 112, vendCents: 13 })
})

// Live Stripe test-mode round trip: VEND_LIVE_STRIPE=1 npm test (needs sk_test STRIPE_SECRET_KEY in .env).
test('live: buyer pays via test SPT, then a failing call is refunded', { skip: !process.env.VEND_LIVE_STRIPE }, async () => {
  process.loadEnvFile?.()
  const { createBuyerFetch } = await import('../scripts/buyer.js')
  const pay = createBuyerFetch(process.env.STRIPE_SECRET_KEY)
  const gw = await listen(createGateway({ stripeSecretKey: process.env.STRIPE_SECRET_KEY }))
  try {
    upstreamMode = 'ok'
    const ok = await pay(`${urlOf(gw)}/t/${tool.id}`, { method: 'POST', body: '{"text":"hi"}' })
    assert.equal(ok.status, 200)
    assert.ok(ok.headers.get('payment-receipt'))
    upstreamMode = 'fail'
    const failed = await pay(`${urlOf(gw)}/t/${tool.id}`, { method: 'POST', body: '{"text":"hi"}' })
    assert.equal(failed.status, 502)
    assert.match((await failed.json()).refundId, /^re_/)
  } finally {
    gw.close()
  }
})
