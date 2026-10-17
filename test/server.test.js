import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

process.env.VEND_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vend-app-'))
const { createApp, computeStats, exampleInput } = await import('../src/server.js')
const { recent } = await import('../src/events.js')
const { getTool } = await import('../src/registry.js')

const noGateway = (req, res) => res.writeHead(402).end()
const servers = []
after(() => servers.forEach((s) => s.close()))

async function start(options) {
  const server = http.createServer(createApp({ gateway: noGateway, makeRunner: () => ({}), ...options }))
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
