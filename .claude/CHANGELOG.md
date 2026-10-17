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
