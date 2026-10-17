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
