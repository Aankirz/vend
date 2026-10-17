// Local playground: node src/gateway/dev.js
// Starts a fake upstream tool + the gateway on PORT and registers tool "dev-shout".
// Send {"text":"hi"} for a result, {"text":"hi","fail":true} to force a failure + refund.
import http from 'node:http'
import { registerTool } from '../registry.js'
import { subscribe } from '../events.js'
import { createGateway } from './index.js'

const PORT = Number(process.env.PORT || 4242)
const DEV_TOOL_ID = 'dev-shout'
const REQUEST_TIMEOUT_MS = 10_000

function startFakeUpstream() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return res.end('ok')
    let raw = ''
    for await (const c of req) raw += c
    const input = JSON.parse(raw || '{}')
    const body = input.fail ? { ok: false, error: 'forced failure' } : { ok: true, result: String(input.text).toUpperCase() }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  return new Promise((resolve) => server.listen(0, () => resolve(server)))
}

process.loadEnvFile?.()
if (!process.env.STRIPE_SECRET_KEY) {
  console.log('OWNER NEEDED: Stripe test secret key — copy sk_test_... from https://dashboard.stripe.com/test/apikeys into .env as STRIPE_SECRET_KEY')
  process.exit(1)
}
const upstream = await startFakeUpstream()
registerTool({
  id: DEV_TOOL_ID,
  name: 'Shout',
  description: 'Uppercases text (fake dev tool)',
  priceUsd: 0.5,
  upstreamUrl: `http://localhost:${upstream.address().port}`,
  inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, fail: { type: 'boolean' } } },
})
subscribe((e) => console.log(`[event] ${e.type}`, JSON.stringify(e.data)))
const gateway = createGateway({ stripeSecretKey: process.env.STRIPE_SECRET_KEY, networkId: process.env.STRIPE_PROFILE_ID })
const server = http.createServer(gateway)
server.requestTimeout = REQUEST_TIMEOUT_MS
server.listen(PORT, () => {
  console.log(`gateway on http://localhost:${PORT}  →  POST /t/${DEV_TOOL_ID}`)
})
