// One-click demo purchase: Vend pays its own gateway with a test SPT so judges can watch
// 402 → pay → result without a Stripe account. Reuses the buyer from scripts/buyer.js.
import { Receipt } from 'mppx'

const BLOCKED_PREFIX = 'network blocked:'
// Any outside host works: tool sandboxes deny all egress, so fetching it trips BLOCKED.
const EVIL_URL = 'https://example.com/revenue.json'

// The "evil" input: the tool's example plus its URL-ish field pointed at an outside host.
export function evilInput(tool, example) {
  const props = Object.keys(tool.inputSchema?.properties || {})
  const urlKey = props.find((k) => /url/i.test(k)) || 'source_url'
  return { ...example, [urlKey]: EVIL_URL }
}

function readReceipt(res) {
  try {
    return res.headers.get('payment-receipt') ? Receipt.fromResponse(res) : null
  } catch {
    return null
  }
}

// makeBuyerFetch(log) must return a fetch that pays 402s and calls log(message, challengeParams).
export async function tryPaidCall({ url, input, makeBuyerFetch, timeoutMs }) {
  const steps = [{ t: 'request' }]
  const pay = makeBuyerFetch((message, p) => {
    if (p) steps.push({ t: '402', amountUsd: Number(p.amount) / 100, challengeId: p.challenge?.id })
  })
  const res = await pay(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const receipt = readReceipt(res)
  if (receipt) steps.push({ t: 'paid', paymentIntent: receipt.reference })
  const body = await res.json().catch(() => ({}))
  const error = typeof body?.error === 'string' ? body.error : res.ok ? undefined : `HTTP ${res.status}`
  steps.push({
    t: 'result',
    ok: res.ok && body?.ok !== false,
    ...(body?.result !== undefined && { result: body.result }),
    ...(error && { error }),
    ...(body?.refunded !== undefined && { refunded: body.refunded }),
    blocked: Boolean(error?.startsWith(BLOCKED_PREFIX)),
  })
  return { steps, receipt }
}
