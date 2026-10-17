# Vend

**Make your agent tool pay for itself.**
Paste a tool → about 90 seconds later it is a verified, sandboxed, pay-per-call service any AI agent can buy with Stripe. Callers pay only if it works.

**Live:** **https://production-vend-gateway.tyzo.nodeops.app** · seller page at [`/sell`](https://production-vend-gateway.tyzo.nodeops.app/sell) · Stripe **test mode** only: no real money moves.

**Demo video:** <link coming>

### Try it: buy a chart for $0.50

**One click:** open **https://production-vend-gateway.tyzo.nodeops.app** and press **Try a paid call** on a live tool. You will see the four steps:

1. the request,
2. `402 Payment Required` for $0.50,
3. a Stripe test payment (a real `pi_…` PaymentIntent),
4. the chart.

**Try the BLOCKED call** to watch the sandbox stop a tool that phones home: you get **BLOCKED**, then an automatic **refund**. Both calls go through the normal gateway, so they appear on [`/sell`](https://production-vend-gateway.tyzo.nodeops.app/sell) and in the live counters.

The button calls this endpoint, which you can also call directly:

```bash
curl -X POST https://production-vend-gateway.tyzo.nodeops.app/api/try/chart-9c1c8e                    # paid call → chart
curl -X POST https://production-vend-gateway.tyzo.nodeops.app/api/try/chart-9c1c8e -d '{"evil":true}'  # BLOCKED → refunded
```

It returns `{ steps: [request, 402, paid, result], receipt }`. Vend acts as a demo buyer against its own gateway with a Stripe **test** card, limited to one call per IP every 10 s and 30 per hour.

**From the command line (for cloning and self-hosting):** `scripts/buyer.js` pays with a test-helper Shared Payment Token. Stripe grants that token to the account whose key creates it, so this only works with the **seller's own** test key, i.e. against your own deployment of Vend:

```bash
npm install
node scripts/buyer.js https://<your-vend>/t/<tool-id> '{"data":[{"label":"Jan","value":12},{"label":"Feb","value":19}],"title":"Monthly sales","kind":"bar"}'
# or: MPPX_STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY npx mppx https://<your-vend>/t/<tool-id> -J '{...}' -M paymentMethod=pm_card_visa -i
```

Send `"kind":"pie"` to watch a failed call get refunded automatically.

---

## How it works

```
SELLER                          VEND                                   CREATEOS
paste tool + price ──▶ packaging agent ──writes wrapper+tests──▶ sandbox: run tests
                         ▲      │                                    │
                         └─fix──┴──────── errors ◀──────────────────┘
                                │ all green → start server, lock network
                                ▼
                         ✅ verified, live at /t/<tool>  ◀── preview URL
BUYER (any agent)
call /t/<tool> ───────▶ gateway: 402 "pay $0.50"
pay (MPP + SPT) ──────▶ gateway: verify, charge ──forward──▶ tool sandbox
                         ◀── result + Payment-Receipt ─────────┘
                         ok    → ledger: seller 90 %, Vend 10 %
                         fail  → automatic Stripe refund
dashboard updates live (build log, calls, earnings, BLOCKED, refunds)
```

| Part | File(s) |
|---|---|
| Seller page + landing | `public/sell.html`, `public/index.html` |
| Packaging agent (write → test → fix loop) | `src/packager/` |
| Toll gate (402 → verify → forward → refund) | `src/gateway/` |
| Tool registry + event log | `src/registry.js`, `src/events.js` (`data/`) |
| App server (API, SSE, static) | `src/server.js` |
| Fallback buyer | `scripts/buyer.js` |

## Stripe Projects

The whole stack was provisioned from the terminal with [Stripe Projects](https://docs.stripe.com/projects):

```bash
stripe projects init vend          # creates the project (state in .projects/)
stripe projects add createos/free      # CreateOS plan (sandboxes)
stripe projects add createos/project   # CreateOS project (app hosting)
stripe projects env --pull         # writes CREATEOS_* credentials into .env
```

`.env` is never committed; `.env.example` lists every variable name.

## Stripe MPP (Machine Payments Protocol)

The gateway is an MPP server built on [`mppx`](https://github.com/wevm/mppx) with Stripe's **Shared Payment Token** method:

1. **402**: an unpaid `POST /t/<id>` returns `402 Payment Required` with a `WWW-Authenticate: Payment … method="stripe" intent="charge"` challenge for the tool's price (HMAC-bound to this server).
2. **SPT**: the buyer gets a Shared Payment Token for that amount. In test mode, that's `POST /v1/test_helpers/shared_payment/granted_tokens` with `pm_card_visa`. The buyer then retries with the credential.
3. **Receipt**: the gateway confirms a PaymentIntent with the SPT, forwards the JSON body to the tool, and returns the result with a `Payment-Receipt` header (`reference` = the PaymentIntent id).
4. **Refund**: if the tool errors, times out, redirects, or reports `network blocked:`, the gateway calls `refunds.create({ payment_intent })` and returns `502 {"refunded": true}`.

Input is validated against the tool's schema **before** any charge. `GET /openapi.json` serves an MPP discovery document; `npx mppx@latest validate <url>` passes.

## CreateOS Sandbox

Each tool is packaged and served inside a CreateOS sandbox:

- **Write → test → fix loop:** an LLM writes `server.py` + `test_tool.py` around the seller's code, runs the tests in the sandbox, reads the failures and fixes its own code until green.
- **Egress lock:** the sandbox is created with a deny-all egress allowlist, and an in-sandbox `curl` is run to *prove* the lock. A tool that tries to phone home gets `network blocked`, the call is marked **BLOCKED** and refunded.
- **Ingress URL:** the verified server listens on port 8080 and gets a public preview URL. That URL is never shown to buyers; they only see `/t/<id>` on the gateway.
- Secrets stay in the gateway. The seller's sandbox never sees a Stripe key.

## Run locally

```bash
npm install
cp .env.example .env      # fill STRIPE_SECRET_KEY (sk_test), AI_GATEWAY_API_KEY, CREATEOS_SANDBOX_API_KEY
npm start                 # http://localhost:8080  (/ and /sell)
npm test                  # node --test, all phases
```

Buy a tool from a terminal (pays with a Stripe test card through an SPT):

```bash
node scripts/buyer.js http://localhost:8080/t/<id> '{"data":[{"label":"Jul","value":120}]}'
# or with mppx's own CLI:
MPPX_STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY npx mppx http://localhost:8080/t/<id> -J '{...}' -M paymentMethod=pm_card_visa -i
```

Other entry points: `node src/gateway/dev.js` (gateway + fake tool only), `node scripts/package.js examples/broken_tool.py --local` (packager CLI; `--reuse <sandboxId>` rebuilds into an existing CreateOS sandbox instead of creating one).

For local builds without a sandbox, start with `VEND_RUNNER=local npm start`. Seller code then runs on your machine, so only do this with code you trust. Without `VEND_RUNNER=local`, the server never falls back to the host: builds are refused until `CREATEOS_SANDBOX_API_KEY` and `VEND_ADMIN_TOKEN` are set.

## Deploy (CreateOS)

Live at **https://production-vend-gateway.tyzo.nodeops.app** on the CreateOS app platform: an upload project with Node 20 and port 8080, deployed to environment `production`. The full runbook is [`docs/phases/deploy-owner.md`](docs/phases/deploy-owner.md). The Stripe Projects key authenticates the CLI, so no browser login is needed:

```bash
export CREATEOS_PROJECT_API_KEY="$(grep '^CREATEOS_PROJECT_API_KEY=' .env | cut -d= -f2-)"

# 1. project (once)
createos projects add --name "Vend" --unique-name vend-gateway --type upload --runtime node:20 \
  --port 8080 --install-command "npm install --omit=dev" --build-command "node --version" \
  --run-command "node src/server.js"          # or --runtime dockerfile (repo Dockerfile)

# 2. environment (once): `env push` fails until the project has one; we use `production`
#    (createos environments …, or the CreateOS dashboard)

# 3. secrets, from a gitignored file
grep -E '^(STRIPE_SECRET_KEY|AI_GATEWAY_API_KEY|CREATEOS_SANDBOX_API_KEY)=' .env > .env.createos
echo "VEND_ADMIN_TOKEN=$(openssl rand -hex 16)" >> .env.createos   # required for public builds
echo "VEND_PUBLIC_URL=https://production-vend-gateway.tyzo.nodeops.app" >> .env.createos
createos env push --file .env.createos --force && rm .env.createos

# 4. deploy, then promote: `createos deploy` does NOT attach the new deployment to the environment
createos deploy                               # prints "Live at: https://…" with the new deployment id
createos deployments promote --project <project-id> --deployment <new-deployment-id> --environment <environment-id>
```

Secrets go in through `createos env`, never git. `.env*` and `data/` are excluded from the upload, so the tool registry starts empty after a redeploy. Re-vend on `/sell`, or set `VEND_SEED_TOOL_URL`.

### Environment variables

| Name | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe **test** secret key (`sk_test_…`); live keys are refused |
| `STRIPE_PROFILE_ID` | optional Stripe profile id advertised as `networkId` in challenges |
| `AI_GATEWAY_API_KEY`, `VEND_MODEL` | LLM for the packaging agent (Vercel AI Gateway) |
| `CREATEOS_SANDBOX_API_KEY` | CreateOS sandboxes for packaging/serving tools |
| `VEND_RUNNER` | `createos` (default) or `local`. `local` runs seller code **on the host**: local dev only, must be set explicitly |
| `VEND_ADMIN_TOKEN` | **required for builds** outside local mode: `POST /api/tools` needs `x-vend-admin: <token>`, and builds are refused (403) when it is unset. Buying stays open |
| `VEND_SEED_TOOL_URL` | optional upstream URL; registers the demo `chart` tool at startup |
| `VEND_PUBLIC_URL` | optional public origin used in buyer snippets |
| `PORT`, `VEND_DATA_DIR`, `VEND_PYTHON` | server port (8080), data dir (`./data`), python for the local runner |

### API

| Route | What |
|---|---|
| `POST /t/:id` | the paid tool endpoint (402 → pay → result) |
| `GET /openapi.json` | MPP discovery document for every live tool |
| `GET /api/tools` | live tools (public fields + example input) |
| `POST /api/tools` | `{name, description, code, priceUsd}` → `202 {jobId}`; one build at a time (409 otherwise) |
| `GET /api/events` | Server-Sent Events: build log, paid / refunded / blocked calls |
| `GET /api/stats` | totals: paid calls, seller earnings, Vend fee, refunds, blocked |
| `POST /api/try/:id` | demo purchase by Vend's own test buyer → `{steps, receipt}`; `{"evil":true}` triggers BLOCKED → refund; rate-limited |

## Go-to-market

- **Who:** indie authors of MCP servers and agent tools. They ship something useful, agents hammer it for free, and the author pays the bill.
- **First channels:** the Stripe Projects catalog (`stripe projects add vend/...`), the MPP services directory (`mppx services`), and the stripe/ai GitHub issues where people already ask "how do I charge agents for my tool?".
- **Pricing:** 10 % of each paid call. No subscription, no setup fee. Sellers keep 90 %.
- **Why now:** agents can finally pay on their own (MPP + Shared Payment Tokens), but there is no supply side: nobody has made it one click for a tool author to *accept* those payments safely.
- **First 10 users plan:** hand-vend 10 popular open-source agent tools (chart, scrape-to-markdown, PDF-to-text…) with their authors' permission. Send each author their live `/t/` URL and earnings link. Post the before/after ("free and rate-limited" → "pays for its own hosting") in the MCP and Stripe developer communities. Collect the first 10 sellers from those threads.

## Roadmap

- **Stripe Connect payouts:** the ledger already records the 90/10 split; next is paying sellers through Connect destination charges.
- **Fork-per-call:** a fresh forked sandbox per call for full isolation between buyers.
- **Tool directory:** a public, searchable catalog of vended tools, also exposed as MCP.

## Honest limits

- **Stripe test mode only.** Payments use test cards via test-helper SPTs; no real money moves.
- **One live tool at a time on the free CreateOS plan:** there is one sandbox and one build at a time. A new build replaces the tool that sandbox was serving, and `/api/tools` lists only the newest tool per sandbox.
- **Python tools only.** The input schema check is a minimal subset (required keys + top-level types).
- **Not durable:** `data/` (tool registry, event log) is a JSON file plus JSONL and may reset on redeploy.
