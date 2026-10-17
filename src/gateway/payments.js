import crypto from 'node:crypto'
import Stripe from 'stripe'
import { Receipt } from 'mppx'
import { Mppx, stripe } from 'mppx/server'
import { generate } from 'mppx/discovery'

// The payment boundary: everything that talks to mppx/Stripe lives here so the
// gateway can be tested with a stub that has the same two functions.
//
//   charge(tool, request) -> { status: 402, challenge: Response }
//                          | { status: 200, receipt, withReceipt(Response) -> Response }
//   refund(paymentIntentId) -> Stripe Refund
//   openapi(tools) -> OpenAPI discovery document (served at /openapi.json for agents + `mppx validate`)
export function createStripePayments({ stripeSecretKey, networkId = 'internal' }) {
  if (!stripeSecretKey) throw new Error('createStripePayments: stripeSecretKey is required')
  if (!stripeSecretKey.startsWith('sk_test_')) throw new Error('Vend runs in Stripe test mode only (sk_test_...)')
  const client = new Stripe(stripeSecretKey)
  // Same derivation as Stripe's MPP docs: binds challenges to this server.
  const secretKey = crypto.createHmac('sha256', stripeSecretKey).update('mpp-challenge-signing').digest('base64')
  const mppx = Mppx.create({
    methods: [stripe.spt({ client, networkId, paymentMethodTypes: ['card'], currency: 'usd', decimals: 2 })],
    secretKey,
  })

  const chargeFor = (tool) => mppx.charge({ amount: tool.priceUsd.toFixed(2), description: tool.name })

  async function charge(tool, request) {
    const result = await chargeFor(tool)(request)
    if (result.status === 402) return result
    // withReceipt is pure (copies headers), so wrapping an empty response is a safe way to read the receipt.
    const receipt = Receipt.fromResponse(result.withReceipt(new Response(null)))
    return { status: 200, receipt, withReceipt: result.withReceipt }
  }

  const refund = (paymentIntentId) => client.refunds.create({ payment_intent: paymentIntentId })

  const openapi = (tools) =>
    generate(mppx, {
      info: { title: 'Vend', version: '1.0.0' },
      routes: tools.map((tool) => ({
        handler: chargeFor(tool),
        method: 'POST',
        path: `/t/${tool.id}`,
        summary: tool.description || tool.name,
        requestBody: { required: true, content: { 'application/json': { schema: tool.inputSchema } } },
      })),
    })

  return { charge, refund, openapi }
}
