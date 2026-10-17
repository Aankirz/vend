# Phase 1 — Vend gateway (the toll gate)

You are a builder on the Vend hackathon project (deadline 06:00 IST today — move fast, ship working slices). Read `PLAN.md` and `docs/phases/CONTRACT.md` first; the contract is binding. Another builder is doing phase 2 (packager) in parallel — stay inside your files.

## Build
- `src/registry.js` and `src/events.js` exactly per CONTRACT.md interfaces.
- `src/gateway/` — handler for `POST /t/:id` (mountable in `node:http`):
  1. Unknown tool → 404. Body fails the tool's `inputSchema` (basic required-keys/type check, no new dep) → 400 **before** any charge.
  2. No payment credential → **HTTP 402** challenge for the tool's `priceUsd` using Stripe MPP via the installed `mppx` package (server side, Stripe method, test mode). Follow the Stripe sample `mpp/server/node-typescript` and `node_modules/mppx` types — do not guess the API.
  3. Valid credential → emit `call.paid`, forward the JSON body to `${upstreamUrl}/run` (timeout ~30s), return the result with the payment receipt header mppx produces. Emit `call.ok` with a ledger split: seller 90%, Vend 10% (constant, named).
  4. Upstream error / timeout / `{ok:false}` → refund the payment with the Stripe Refunds API (test mode), emit `call.failed` + `call.refunded`, return 502 with a JSON error that says the buyer was refunded.
- `scripts/buyer.js` — a CLI buyer: `node scripts/buyer.js <gatewayUrl>/t/<id> '<json>'` that hits the endpoint, gets the 402, pays with the `mppx` client using a **Stripe test-mode** payment credential (find the documented test path, e.g. test Shared Payment Tokens / test payment method), retries, prints result + receipt. This is the fallback buyer if the Link agent wallet is not usable.
- `src/gateway/dev.js` (or similar) — a tiny runnable: starts the gateway on `PORT` with a fake upstream tool so the whole flow can be exercised locally.
- Tests in `test/gateway*.test.js` with `node --test`: 404, 400-before-charge, 402 shape, paid → forwarded, upstream failure → refund called. Stub Stripe/mppx verification at the boundary for unit tests; keep one live-test-mode path behind an env flag.
- Set `"test": "node --test"` in `package.json` scripts. Add needed env names (blank) to `.env.example`. Ensure `data/` is gitignored.

## Facts already settled (by the coordinator)
- `.env` already has `STRIPE_SECRET_KEY` (sk_test, verified `livemode:false`). Load it with `process.loadEnvFile?.()` or `node --env-file=.env`. No OWNER NEEDED for the key.

## Not in this phase
Packaging agent, sandboxes, the seller web page, `src/server.js`, deployment, Stripe Connect transfers (ledger split only), MCP exposure.

## Done when
1. `npm test` passes and covers the five cases above.
2. Running the dev runnable and `curl -i -X POST localhost:$PORT/t/<id> -d '{...}'` returns `402` with an MPP `WWW-Authenticate` challenge for the tool price.
3. If `STRIPE_SECRET_KEY` (sk_test) is available: `node scripts/buyer.js …` completes 402 → pay → 200 with a receipt, and the PaymentIntent is visible via `stripe payment_intents list --limit 1`. If not available: `OWNER NEEDED` is printed with exact steps, and the path is ready.
4. Forcing the fake upstream to fail produces a refund (verified via Stripe test API when the key is available, via stub in tests otherwise) and `call.refunded` in `data/events.jsonl`.
5. `npx mppx@latest validate` against the dev gateway passes, or its output is in your hand-off.
6. No secret in git (`git grep -nE 'sk_(test|live)_'` empty). All work pushed to `build`.

## Sources of truth
CONTRACT.md list. Key: `https://docs.stripe.com/payments/machine/mpp.md`, the machine-payments sample, `node_modules/mppx`. Look it up, never invent an API, model id, or flag.

## Gate
`npm test` — must pass before every push.

## Branch / OWNER NEEDED
Per CONTRACT.md. Branch `build`, `git pull --rebase origin build` before push. Likely OWNER NEEDED: a Stripe **test** secret key in `.env` (owner can copy from dashboard.stripe.com/test/apikeys). Try `stripe config --list` / the Stripe CLI's own test key first if it is accessible without prompting.
