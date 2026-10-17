import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

process.env.VEND_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vend-app-'))
const { createApp, computeStats, exampleInput, sanitizeSchema, liveTools } = await import('../src/server.js')
const { recent } = await import('../src/events.js')
const { getTool, registerTool } = await import('../src/registry.js')

const noGateway = (req, res) => res.writeHead(402).end()
const servers = []
after(() => servers.forEach((s) => s.close()))

async function start(options) {
  const server = http.createServer(createApp({ gateway: noGateway, runnerMode: 'local', makeRunner: () => ({}), ...options }))
  await new Promise((r) => server.listen(0, r))
  servers.push(server)
  return `http://localhost:${server.address().port}`
}

const submission = { name: 'shout', description: 'Uppercases text', code: 'def shout(t):\n    return t.upper()\n', priceUsd: 0.5 }
const post = (base, body, headers = {}) =>
  fetch(`${base}/api/tools`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

test('POST /api/tools rejects invalid submissions', async () => {
  const base = await start({ packageTool: async () => assert.fail('must not build'), adminToken: '' })
  const bad = [
    { ...submission, name: 'Bad Name' },
    { ...submission, name: 'x' },
    { ...submission, code: '' },
    { ...submission, code: 'x'.repeat(20 * 1024 + 1) },
    { ...submission, priceUsd: 0.49 },
    { ...submission, priceUsd: 0.505 },
    { ...submission, priceUsd: 'abc' },
    { ...submission, description: 7 },
  ]
  for (const body of bad) assert.equal((await post(base, body)).status, 400, JSON.stringify(body).slice(0, 60))
})

test('admin token is required when VEND_ADMIN_TOKEN is set', async () => {
  let release
  const base = await start({ adminToken: 's3cret', packageTool: () => new Promise((r) => (release = r)) })
  assert.equal((await post(base, submission)).status, 401)
  assert.equal((await post(base, submission, { 'x-vend-admin': 'wrong' })).status, 401)
  assert.equal((await post(base, submission, { 'x-vend-admin': 's3cret' })).status, 202)
  release({ testsPassed: false, attempts: 1 })
})

test('second build while one runs gets 409; a finished build registers the tool', async () => {
  let release
  const base = await start({ adminToken: '', packageTool: async (tool, { onLog }) => {
    onLog('writing wrapper')
    await new Promise((r) => (release = r))
    return { testsPassed: true, attempts: 2, upstreamUrl: 'http://localhost:9', sandboxId: 'sb_1', inputSchema: { type: 'object' } }
  } })
  const first = await post(base, submission)
  assert.equal(first.status, 202)
  const { jobId } = await first.json()
  assert.equal((await post(base, submission)).status, 409)
  release()
  await new Promise((r) => setTimeout(r, 50))
  const done = recent(10).find((e) => e.type === 'build.done' && e.data.jobId === jobId)
  assert.equal(done.data.ok, true)
  assert.equal(getTool(done.data.toolId).upstreamUrl, 'http://localhost:9')
  assert.ok(recent(10).some((e) => e.type === 'build.log' && e.data.jobId === jobId))
  assert.equal((await post(base, submission)).status, 202) // lock released
  release()
})

test('stats add up paid calls, 90/10 ledger, refunds and blocks', () => {
  const ev = (type, data) => ({ type, data })
  const stats = computeStats([
    ev('call.paid', { amountUsd: 0.5 }), ev('call.ok', { ledger: { sellerCents: 45, vendCents: 5 } }),
    ev('call.paid', { amountUsd: 1.25 }), ev('call.ok', { ledger: { sellerCents: 112, vendCents: 13 } }),
    ev('call.paid', { amountUsd: 0.5 }), ev('call.failed', {}), ev('call.refunded', { amountUsd: 0.5 }),
    ev('call.paid', { amountUsd: 0.5 }), ev('call.blocked', {}), ev('call.refunded', { amountUsd: 0.5 }),
    ev('build.log', { line: 'noise' }),
  ])
  assert.deepEqual(stats, { paidCalls: 4, okCalls: 2, failedCalls: 1, refunds: 2, blocked: 1, grossCents: 275, sellerCents: 157, vendCents: 18, refundedCents: 100 })
})

test('GET /api/stats and /api/tools answer; static pages and traversal', async () => {
  const base = await start({ adminToken: '' })
  assert.equal((await fetch(`${base}/api/stats`)).status, 200)
  const tools = await (await fetch(`${base}/api/tools`)).json()
  assert.ok(tools.every((t) => !('upstreamUrl' in t) && !('sandboxId' in t) && t.url.startsWith(base)))
  for (const page of ['/', '/sell']) assert.match(await (await fetch(base + page)).text(), /<html/i)
  assert.equal((await fetch(`${base}/..%2f.env`)).status, 404)
  assert.equal((await fetch(`${base}/t/anything`, { method: 'POST' })).status, 402) // routed to the gateway
})

test('exampleInput prefers schema examples, then typed placeholders', () => {
  assert.deepEqual(exampleInput({ required: ['a', 'b'], properties: { a: { type: 'string', examples: ['x'] }, b: { type: 'integer' } } }), { a: 'x', b: 1 })
  const chart = { properties: { data: { type: 'array', items: { type: 'object', required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'number' } } } } } }
  assert.deepEqual(exampleInput(chart), { data: [{ label: 'hello', value: 1 }] })
})

test('#1 no silent local fallback: without VEND_RUNNER=local a missing sandbox key refuses builds', async () => {
  const base = await start({ runnerMode: undefined, sandboxKey: '', adminToken: 't', makeRunner: undefined, packageTool: async () => assert.fail('must not build') })
  const res = await post(base, submission, { 'x-vend-admin': 't' })
  assert.equal(res.status, 503)
  assert.match((await res.json()).error, /CREATEOS_SANDBOX_API_KEY/)
})

test('#2 builds are refused (403) when VEND_ADMIN_TOKEN is unset outside local mode', async () => {
  const base = await start({ runnerMode: 'createos', sandboxKey: 'skp_x', adminToken: '', packageTool: async () => assert.fail('must not build') })
  const res = await post(base, submission)
  assert.equal(res.status, 403)
  assert.match((await res.json()).error, /VEND_ADMIN_TOKEN/)
})

async function buildOnce(packageTool, makeRunner = () => ({})) {
  const base = await start({ adminToken: '', packageTool, makeRunner })
  const { jobId } = await (await post(base, submission)).json()
  for (let i = 0; i < 50 && !recent(50).some((e) => e.type === 'build.done' && e.data.jobId === jobId); i++) await new Promise((r) => setTimeout(r, 10))
  return recent(50).filter((e) => e.data?.jobId === jobId)
}

test('#3 sandbox URLs are stripped from the build log', async () => {
  const events = await buildOnce(async (t, { onLog }) => {
    onLog('live at https://abc-8080.app.sb.createos.sh/x')
    return { testsPassed: false, attempts: 1 }
  })
  const line = events.find((e) => e.type === 'build.log').data.line
  assert.equal(line, 'live at [hidden]')
})

test('#4 malformed LLM schemas are replaced and never break /api/tools', async () => {
  assert.deepEqual(sanitizeSchema({ type: 'object', required: 'text' }), { type: 'object' })
  assert.deepEqual(sanitizeSchema({ properties: [] }), { type: 'object' })
  assert.deepEqual(sanitizeSchema({ properties: { a: { type: 'string', examples: ['x'.repeat(20000)] } } }), { type: 'object' })
  assert.deepEqual(sanitizeSchema(null), { type: 'object' })
  const ok = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } }
  assert.equal(sanitizeSchema(ok), ok)
  assert.deepEqual(exampleInput({ properties: { a: { type: 'array', items: { get type() { throw new Error('boom') } } } } }), {})
})

test('#5 only the newest tool per sandbox is listed', () => {
  const tools = [
    { id: 'old', sandboxId: 'sb1', createdAt: '2026-10-18T01:00:00Z' },
    { id: 'new', sandboxId: 'sb1', createdAt: '2026-10-18T02:00:00Z' },
    { id: 'other', sandboxId: 'sb2', createdAt: '2026-10-18T00:00:00Z' },
    { id: 'seed', sandboxId: null, createdAt: '2026-10-17T00:00:00Z' },
  ]
  assert.deepEqual(liveTools(tools).map((t) => t.id), ['new', 'other', 'seed'])
})

test('#8 a registration failure after packaging releases the sandbox', async () => {
  let destroyed = 0
  const events = await buildOnce(
    async () => ({ testsPassed: true, attempts: 1, upstreamUrl: 'file:///not-http', sandboxId: 'sb_9' }),
    () => ({ destroy: async () => destroyed++ }),
  )
  const done = events.find((e) => e.type === 'build.done')
  assert.equal(done.data.ok, false)
  assert.equal(destroyed, 1)
})

test('#6 /api/stats stays current from the event bus without re-reading the log', async () => {
  const { emit } = await import('../src/events.js')
  const base = await start({ adminToken: '' })
  const before = await (await fetch(`${base}/api/stats`)).json()
  emit('call.paid', { amountUsd: 0.5 })
  emit('call.ok', { ledger: { sellerCents: 45, vendCents: 5 } })
  const after = await (await fetch(`${base}/api/stats`)).json()
  assert.equal(after.paidCalls - before.paidCalls, 1)
  assert.equal(after.sellerCents - before.sellerCents, 45)
})

describeTry()
function describeTry() {
  const receiptHeader = async () => {
    const { Receipt } = await import('mppx')
    return Receipt.serialize({ method: 'stripe', status: 'success', timestamp: new Date().toISOString(), reference: 'pi_stub_try' })
  }
  // Stub payment client: announces a $0.50 challenge, then answers like the gateway would.
  const stubBuyer = (reply, seen = []) => (key, log) => async (url, init) => {
    seen.push({ url, input: JSON.parse(init.body) })
    log('402 received', { amount: '50', currency: 'usd', challenge: { id: 'ch_stub' } })
    return new Response(JSON.stringify(reply), { status: reply.ok ? 200 : 502, headers: { 'payment-receipt': await receiptHeader() } })
  }
  const tryTool = async (base, id, body = {}) => fetch(`${base}/api/try/${id}`, { method: 'POST', body: JSON.stringify(body) })
  const chartTool = () => registerTool({
    name: 'chart', priceUsd: 0.5, upstreamUrl: 'http://localhost:9',
    inputSchema: { type: 'object', required: ['data'], properties: { data: { type: 'array', examples: [[{ label: 'a', value: 1 }]] }, source_url: { type: 'string' } } },
  })

  test('try: refuses without a Stripe test key', async () => {
    const tool = chartTool()
    for (const stripeSecretKey of [undefined, 'sk_live_whatever', 'rk_test_x']) {
      const base = await start({ stripeSecretKey, makeBuyerFetch: () => assert.fail('must not pay') })
      assert.equal((await tryTool(base, tool.id)).status, 503)
    }
  })

  test('try: returns request → 402 → paid → result with the chart', async () => {
    const tool = chartTool()
    const seen = []
    const base = await start({ stripeSecretKey: 'sk_test_unit', makeBuyerFetch: stubBuyer({ ok: true, result: 'iVBORw0KGgo' }, seen) })
    const out = await (await tryTool(base, tool.id)).json()
    assert.deepEqual(out.steps.map((s) => s.t), ['request', '402', 'paid', 'result'])
    assert.deepEqual(out.steps[1], { t: '402', amountUsd: 0.5, challengeId: 'ch_stub' })
    assert.equal(out.steps[2].paymentIntent, 'pi_stub_try')
    assert.deepEqual(out.steps[3], { t: 'result', ok: true, result: 'iVBORw0KGgo', blocked: false })
    assert.equal(out.receipt.reference, 'pi_stub_try')
    assert.match(seen[0].url, new RegExp(`/t/${tool.id}$`))
    assert.deepEqual(seen[0].input, { data: [{ label: 'a', value: 1 }] }) // example input by default
  })

  test('try: evil input points the URL field outside and reports blocked + refunded', async () => {
    const tool = chartTool()
    const seen = []
    const reply = { ok: false, error: 'network blocked: <urlopen error>', refunded: true, refundId: 're_1' }
    const base = await start({ stripeSecretKey: 'sk_test_unit', makeBuyerFetch: stubBuyer(reply, seen) })
    const out = await (await tryTool(base, tool.id, { evil: true })).json()
    assert.match(seen[0].input.source_url, /^https:\/\//)
    assert.deepEqual(out.steps.at(-1), { t: 'result', ok: false, error: reply.error, refunded: true, blocked: true })
  })

  test('try: a second call from the same IP within 10 s gets 429', async () => {
    const tool = chartTool()
    const base = await start({ stripeSecretKey: 'sk_test_unit', makeBuyerFetch: stubBuyer({ ok: true, result: 'x' }) })
    assert.equal((await tryTool(base, tool.id)).status, 200)
    const second = await tryTool(base, tool.id)
    assert.equal(second.status, 429)
    assert.match((await second.json()).error, /10 seconds/)
  })

  test('try: unknown tool 404, non-object body 400', async () => {
    const base = await start({ stripeSecretKey: 'sk_test_unit', makeBuyerFetch: stubBuyer({ ok: true }) })
    assert.equal((await tryTool(base, 'nope')).status, 404)
    const tool = chartTool()
    assert.equal((await fetch(`${base}/api/try/${tool.id}`, { method: 'POST', body: '[1]' })).status, 400)
  })
}
