# Phase 3 — The Vend app: landing, seller page, buyer path, deploy, README

You are a builder on the Vend hackathon project (deadline 06:00 IST — move fast). Read `PLAN.md`, `docs/phases/CONTRACT.md` (binding), then skim `src/gateway/`, `src/registry.js`, `src/events.js`, `src/packager/index.js` — you wire them together, you do **not** edit them (if one needs a change, say so in your hand-off). Phase 2 (packager) may still be pushing fixes in parallel.

## Build
- `src/server.js` — one `node:http` server (`PORT`, default 8080), loads `.env` if present:
  - `POST /t/:id`, `GET /openapi.json` → the existing gateway handler.
  - `GET /api/tools` → `listTools()` (public fields only: id, name, description, priceUsd, inputSchema, url).
  - `GET /api/events` → Server-Sent Events: `recent(50)` then live `subscribe`.
  - `GET /api/stats` → totals from events: paid calls, seller earnings, Vend fee, refunds, blocked.
  - `POST /api/tools` → body `{name, description, code, priceUsd}`; validates (price ≥ 0.50 whole cents, code ≤ 20 KB, name slug); runs `packageTool` with `onLog` → `emit('build.log', …)`; on `testsPassed` → `registerTool` + `emit('build.done', …)`; returns the job id immediately (202) and streams progress over SSE. **One build at a time** (free plan = 1 sandbox) → 409 "a build is running" otherwise. If `VEND_ADMIN_TOKEN` is set, require header `x-vend-admin: <token>` for this route (the public deploy must not let strangers burn our sandbox quota); buying stays open to everyone.
  - Static files from `public/`.
- `public/index.html` — landing: one-line pitch "Make your agent tool pay for itself", a 3-step "how it works" (paste → verified in a sandbox → agents pay per call), live counters from `/api/stats`, the list of live tools with their buyer snippet, and a "Vend a tool" button to `/sell`.
- `public/sell.html` — seller page: textarea for Python code (prefilled with `examples/broken_tool.py` contents via a "load example" button), name, description, price (default 0.50), admin token field (stored in `sessionStorage`), "Vend it" button; live build log (from SSE) showing fail → fix → ✅ green → network locked → live URL; then an earnings/trust panel: each call as a row (paid ✅, refunded ↩, BLOCKED ⛔) with the 90/10 ledger.
- Buyer snippet per tool (on both pages, copy button): `node scripts/buyer.js <origin>/t/<id> '<example json>'` and the `npx mppx` one-liner from `scripts/buyer.js` comments, plus a one-line prompt for Claude Code ("Use Vend tool <url>: pay with scripts/buyer.js and chart my revenue").
- Design: shadcn/Vercel/Notion feel, light + dark via CSS custom properties on `:root`, Inter + JetBrains Mono, intentional hierarchy, monospace log panel, semantic HTML, works at 375px. Plain HTML/CSS/vanilla JS, no framework, no build step. **Escape every dynamic string** (events carry untrusted tool output) — `textContent`, never `innerHTML` with data.
- Deploy: deploy the app to **CreateOS** (app platform, not a sandbox) so it has a public HTTPS URL — `createos deploy` / `createos init` with the `CREATEOS_PROJECT_*` credentials Stripe Projects put in `.env` (read https://createos.sh/docs/llms.txt for the deploy flow; set env vars via `createos env`, never commit them). Persisted `data/` may reset on redeploy — acceptable; seed the demo tool at startup if `VEND_SEED_TOOL_URL` is set.
- `README.md` — what Vend is (2 lines), 90-second demo GIF/screenshot placeholder, how it uses **Stripe Projects** (exact commands run: `stripe projects init`, `add createos/free`, `add createos/project`, `env --pull`), **Stripe MPP** (402 → SPT → receipt → refund), **CreateOS Sandbox** (ingress URL, egress lock, write-test-fix loop), architecture diagram (ASCII from PLAN.md), run locally, env var names, a **Go-to-market** section (who: indie MCP/agent-tool authors; first channel: Stripe Projects catalog + MPP directory + stripe/ai GitHub issues; pricing: 10% per call; why now: agents can pay on their own; first 10 users plan), roadmap (Connect payouts, fork-per-call, tool directory), and honest limits (test mode, 1 sandbox on free plan).
- `npm start` → `node src/server.js`. Tests: `test/server*.test.js` for `/api/tools` validation, 409 when busy, admin-token check, `/api/stats` math (stub `packageTool`).

## Not in this phase
Changing gateway/packager/registry/events internals, Stripe Connect, Link wallet, MCP server, auth beyond the admin token, a database, a frontend framework.

## Done when
1. `npm test` passes (all phases' tests).
2. `npm start` locally: `/` and `/sell` render (check 375px and desktop, light and dark); pasting the broken example and clicking "Vend it" streams a failing test, a fix, ✅ green, "network locked", and a live URL — **using the local runner is acceptable for this check if the sandbox quota is low; say which you used.**
3. A buyer run against the local server (`scripts/buyer.js`) shows up within 2s on `/sell` as a paid row and the counters move; a forced failure shows a refunded row.
4. The app is deployed on CreateOS at a public HTTPS URL: `/` loads from outside, `/api/tools` answers, `POST /t/<id>` returns 402. URL in your hand-off.
5. README covers every bullet above; no secrets; `.env.example` lists every env var name with blank values.
6. All pushed (`git push origin HEAD:build`; the coordinator mirrors to main).

## Sources of truth
CONTRACT.md list; CreateOS deploy docs from https://createos.sh/docs/llms.txt. Look it up, never invent an API, model id, or flag.

## Gate
`npm test` before every push.

## Branch / OWNER NEEDED
Per CONTRACT.md. Likely OWNER NEEDED: `createos login` (browser) if deploy needs a user session rather than the project API key — print the exact command for the owner, and keep building meanwhile.
