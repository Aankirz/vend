## 2026-10-17 — Repo created
- Created Aankirz/vend (public), cloned to ~/Desktop/vend
- Added PLAN.md (build plan for approval) and ignored .projects/vault/
## 2026-10-18 — Plan explainer page
- Added docs/vend-plan.html (end-to-end plan explainer with sketches and mockups)

## 2026-10-18 — Session handoff + first push
- Added docs/HANDOFF.md (hackathon facts, setup state, references); pushed branch build to GitHub.
- Stripe Projects blocked: CLI holds test-mode key only; user re-login with live account pending.

## 2026-10-18 — Phase 1: Vend gateway (toll gate)
- Added src/registry.js (data/tools.json) and src/events.js (bus + data/events.jsonl) per CONTRACT.md.
- Added src/gateway/: POST /t/:id → 404 / 400-before-charge / MPP 402 (mppx, Stripe SPT, test mode) / forward to upstream /run / auto-refund on failure; GET /openapi.json discovery; 90/10 ledger split.
- Added scripts/buyer.js (mppx client paying with Stripe test SPTs), src/gateway/dev.js (fake upstream + gateway), test/gateway.test.js; npm test = node --test; .env.example; data/ gitignored.

## 2026-10-18 — Phase 2: packaging agent
- Added src/packager/ (llm.js via Vercel AI Gateway, local + CreateOS runners, index.js write→test→fix loop capped at 4, serve + /health wait).
- Added examples/chart_tool.py, examples/broken_tool.py (returns bytes instead of base64 str), scripts/package.js CLI, test/packager.test.js (stubbed LLM, local runner).
- .env.example: AI_GATEWAY_API_KEY, VEND_MODEL, CREATEOS_SANDBOX_API_KEY, VEND_AUTO_PAUSE_SECONDS, VEND_PYTHON.

## 2026-10-18 — Phase 1 Amendment A: BLOCKED handling
- Gateway emits call.blocked (instead of call.failed) when the tool reports `network blocked: ...`, then refunds via the same path; test added.
- Documented the `npx mppx` CLI one-liner (test-helper SPT) in scripts/buyer.js.

## 2026-10-18 — Phase 1 review round 1 fixes
- Gateway: whole handler in try/catch (malformed %-encoding no longer crashes); non-string tool errors coerced; any failure after the charge goes to the refund path; event writes can't block refunds; refund failure emits call.refund_failed.
- SSRF: upstream fetch uses redirect:'manual' (3xx = failure); registerTool requires http(s) upstreamUrl. Upstream response capped at 1 MB; oversized request bodies destroy the socket; dev server requestTimeout 10s.
- Registry: own-property lookup (no __proto__/constructor hits), atomic tools.json writes, price must be finite whole cents >= $0.50.
- Regression tests for each; live test-mode run evidenced in hand-off.

## 2026-10-18 — Packager: Amendment A + live-LLM fixes
- CreateOS runner: egress locked at create (`["192.0.2.1:9"]`), reuses a running vend-* sandbox or `--reuse <id>`, auto-pause removed.
- Example tools: optional `source_url` path; network failure raises `network blocked: ...` (HTTP errors do not).
- LLM: retries provider errors; fix turns folded into one user message (stealth/cat-jam rejects assistant turns with 400); base64 blobs shrunk in prompts/logs; seller code untouched until a test fails.

## 2026-10-18 — Packager: CreateOS server start fix
- runner-createos startServer uses `setsid -f` with all fds redirected; the `cmd &` form held the exec pipe open and hung runCommand. Verified live: preview URL /health 200, /run returns PNG, in-sandbox curl fails after lock.

## 2026-10-18 — Phase 3: Vend app (server, pages, README)
- Added src/server.js: gateway mount (/t/:id, /openapi.json), /api/tools (list + admin-gated single-build submit → packageTool → registerTool), /api/events SSE (backlog from events.jsonl), /api/stats, static public/.
- Added public/index.html, public/sell.html, public/app.js, public/styles.css (light/dark tokens, Inter + JetBrains Mono, textContent-only rendering, 375px-safe).
- Rewrote README (Stripe Projects, MPP, CreateOS Sandbox, architecture, GTM, roadmap, limits); npm start; .env.example lists every env var; test/server.test.js.

## 2026-10-18 — Deploy owner steps
- Added docs/phases/deploy-owner.md: denied createos command + error text, exact owner deploy/verify commands, fallbacks.

## 2026-10-18 — Dockerfile deploy fallback
- Added Dockerfile + .dockerignore (node:20-slim, npm ci --omit=dev, excludes .env/data); smoke-tested locally.

## 2026-10-18 — Phase 3 review round 1 fixes
- server: no silent local-runner fallback (VEND_RUNNER=local must be explicit, else sandbox key required → 503); builds refused (403) without VEND_ADMIN_TOKEN outside local mode; sandbox URLs stripped from build log; LLM schemas sanitized and exampleInput cannot 500; /api/tools lists newest tool per sandbox; stats + SSE backlog cached in memory from the event bus; sandbox released if registration fails.
- README: Deploy section, admin-token requirement, one live tool per sandbox, --reuse; .env.example comments; regression tests.

## 2026-10-18 — Packager review round 1 fixes
- Public log says `live ✅` without the upstream URL (it bypassed the paid gateway).
- Unverified egress lock (`lockNetwork() === false`) throws `egress lock not verified`; local runner returns null (no egress control).
- Runners gained `release()`; failure paths (incl. create failure, now inside try) release instead of destroying the scarce CreateOS VM.
- Local runner children get only PATH + PYTHONDONTWRITEBYTECODE; requirement names single-quoted; llm.js sets max_tokens.
- Tests: lock-not-verified, setup failure, release-not-destroy, env isolation, no URL in log.

## 2026-10-18 — Phase 3b UI taste pass (landing + seller page)
- Redesigned `public/index.html` (Narrative Workflow: 402 exchange hero, live ledger line, 3-stage graphite band) and `public/sell.html` (Workbench: form │ build log │ earnings in one 1440×900 screen) on a Cobalt OKLCH token set with light + dark.
- Added step player, "Vend it" press/loading/success states and an earnings roll-up with a +delta; moved seller script to `public/sell.js`.
- Fixed: BLOCKED stays sticky through its refund ("⛔ BLOCKED · refunded"); early build.log lines before the 202 are kept; SSE backlog replay triggers one coalesced `/api/stats` fetch instead of up to 50.

## 2026-10-18 — Gateway: BLOCKED on non-2xx tool replies
- callUpstream reads the JSON body before mapping non-2xx, so `network blocked:` errors from real tools (HTTP 400) emit call.blocked; regression test.
