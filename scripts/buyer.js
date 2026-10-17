// Fallback buyer: node scripts/buyer.js <gatewayUrl>/t/<id> '<json>'
// Hits the endpoint, receives the 402 challenge, pays with a Stripe *test-mode*
// Shared Payment Token, retries via the mppx client and prints result + receipt.
import { fileURLToPath } from 'node:url'
import { Receipt } from 'mppx'
import { Mppx, stripe } from 'mppx/client'

// Stripe test helper that grants this account an SPT backed by a test card.
// Docs: https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller
const SPT_TEST_HELPER_URL = 'https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens'
const SPT_API_VERSION = '2026-04-22.preview'
const TEST_PAYMENT_METHOD = 'pm_card_visa'

async function createTestSpt(secretKey, { amount, currency, expiresAt, paymentMethod }) {
  const res = await fetch(SPT_TEST_HELPER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${secretKey}`, 'stripe-version': SPT_API_VERSION },
    body: new URLSearchParams({
      payment_method: paymentMethod,
      'usage_limits[currency]': currency,
      'usage_limits[max_amount]': amount,
      'usage_limits[expires_at]': String(expiresAt),
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`SPT test helper failed: ${body.error?.message || res.status}`)
  return body.id
}

// A fetch that pays MPP 402 challenges with test SPTs. `log(message, challengeParams)` sees each challenge.
export function createBuyerFetch(secretKey, log = () => {}) {
  if (!secretKey?.startsWith('sk_test_')) throw new Error('buyer needs a Stripe test secret key (sk_test_...)')
  const mppx = Mppx.create({
    polyfill: false,
    methods: [
      stripe.charge({
        paymentMethod: TEST_PAYMENT_METHOD,
        createToken: async (p) => {
          log(`402 received: paying ${(Number(p.amount) / 100).toFixed(2)} ${p.currency.toUpperCase()} with a test SPT`, p)
          return createTestSpt(secretKey, p)
        },
      }),
    ],
  })
  return mppx.fetch
}

async function main() {
  const [url, input = '{}'] = process.argv.slice(2)
  if (!url) {
    console.error("usage: node scripts/buyer.js <gatewayUrl>/t/<id> '<json>'")
    process.exit(2)
  }
  process.loadEnvFile?.()
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('OWNER NEEDED: Stripe test secret key — copy sk_test_... from https://dashboard.stripe.com/test/apikeys into .env as STRIPE_SECRET_KEY')
    process.exit(1)
  }
  const pay = createBuyerFetch(process.env.STRIPE_SECRET_KEY, (m) => console.log(m))
  const res = await pay(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input })
  console.log(`HTTP ${res.status}`)
  console.log(JSON.stringify(await res.json().catch(() => null), null, 2))
  if (res.headers.get('payment-receipt')) console.log('receipt:', Receipt.fromResponse(res))
  if (!res.ok) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
