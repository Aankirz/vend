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

## 2026-10-18 — README: live URL and deploy
- README top: live URL, try-it with chart-9c1c8e ($0.50) buyer one-liners, demo video placeholder; Deploy section matches deploy-owner.md (environment + promote).

## 2026-10-18 — Phase 5: Try a paid call API
- POST /api/try/:toolId: Vend pays its own gateway with a test SPT (reuses scripts/buyer.js) and returns request → 402 → paid → result steps + receipt; {"evil":true} points the tool URL field outside to trigger BLOCKED → refund. Test-key only, per-IP 10 s + 30/h limits, 30 s timeout. src/demo-buyer.js, tests, README Try-it.

## 2026-10-18 — Phase 4 launch music video (video/)
- Added `video/`, a self-contained Remotion 4.0.536 project: 40 s 1920×1080 beat-cut film + 1080×1920 vertical cut, snapcn components (block-wordmark, text-reveal, terminal-simulator, screen-recording, punch-lines, wordmark-cut).
- Music generated in-repo by `video/music/make-track.mjs` (120 BPM PCM synth + macOS `say` chant "Vend it." ×6, "Pay per call." ×3, "Four oh two!"); beat map in `video/audiomap.json`, frames in `video/STORYBOARD.md`.
- Footage captured from the live site (`video/scripts/capture.mjs`); real build log, buyer output and BLOCKED · refunded row on screen.

## 2026-10-18 — phase 3c: redesign / around an isometric vending machine
- New hero: hand-inked isometric vending machine (own SVG, pencil filter) that vends on load/click and on Try-it results; Try a paid / malicious call buttons on hero and every tool (POST /api/try/:id, steps land one by one, 429 countdown, base64 image validated).
- Geist type, Stripe-indigo accent, shadows over borders, hover gated to fine pointers, 16px inputs on touch, theme-color per scheme.
- Hairline figures (MIT, vendored at public/vendor/hairline.js) for Fig. 01–04, lazy-mounted via IntersectionObserver.
- OG/Twitter card meta + public/og.png (1200×630, rendered from the same SVG).
- break-ui fixes: grouped money/counts, capped long log lines, ledger split wraps, long totals step down a size, show-all for long tool lists, attempts pluralized.

## 2026-10-18 — phase 3c: design the waits
- /sell: one plain sentence for what the build is doing right now (mapped from real log lines), elapsed clock in the status pill, failing test framed as "caught a bug", failure message says what failed; live-feed loss shown inline.
- /: snippets folded behind "Call it from a terminal or agent" so Try is the focal action; "What the agent sees" row; hero no longer jumps when the try panel opens; ledger split only wraps on phones.

## 2026-10-18 — phase 3c: vend animation + ledger fixes
- Vended chart now drops into the tray (CSS transform no longer overrides its SVG translate; drawn above the tray).
- Ledger split stacks seller amount over vend fee so $9,999.99 calls never clip; 401 on /sell focuses the admin field with a plain message; figure notes hidden on phones.

## 2026-10-18 — phase 3c: dark machine + 409
- Machine cap/band/tray/slot use solid-ink tokens so dark mode keeps them dark; 409 on /sell names the running job.

## 2026-10-18 — Phase 6 demo video pipeline
- Added demo/: Playwright recorder, terminal replay, narration EDL, ffmpeg renderer, owner-slot swap (`npm --prefix demo run final`); gitignored renders and owner clips.

## 2026-10-18 — fix: serve hairline from public/lib
- CreateOS uploader drops folders named vendor; moved public/vendor/hairline.js to public/lib/ and updated the import in home.js.

## 2026-10-18 — Launch video re-shot on the redesigned site
- Re-captured / from the live site (isometric hero, 3 s hold) and re-rendered video/out/vend-launch.mp4 + vertical; ledger beats keep sell-ledger.png (earlier live capture with the real paid + BLOCKED rows, since the redeployed /sell is empty).

## 2026-10-18 — Demo cut 2 per coordinator review
- Re-recorded on redesign; Try buttons for buyer/BLOCKED; zoomed build log; larger terminal text; captions top-right; trim to video length.
