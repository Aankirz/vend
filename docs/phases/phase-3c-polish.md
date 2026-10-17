# Phase 3c — Craft pass: critique, break, motion (public/** only)

You are a builder on Vend (deadline 06:00 IST; finish and push by **04:45 IST**). You own **`public/**` only**. Other builders own `src/**`, `README.md`, and `video/**` — do not touch them. Read `PLAN.md` and `docs/phases/phase-3b-ui.md` (the previous UI pass) first. The live site is https://production-vend-gateway.tyzo.nodeops.app — `/` and `/sell` are the demo screens.

## Use these skills, in this order (invoke each by name)
1. **`critique`** — run it on `/` and `/sell` (running locally: `PORT=8787 VEND_RUNNER=local node --env-file=.env src/server.js`). Write the findings down.
2. **`break-ui`** — feed worst-case data: a 60-char tool name, a 20 KB code paste, 200 live tools, a $9,999.99 price, zero tools, 10,000 calls, a long error string in the log, a narrow 320px screen. Use local data only (VEND_RUNNER=local; never create CreateOS sandboxes).
3. **`emil-design-eng`** — the polish bar (shadows over borders, easing, spacing, focus states, the invisible details).
4. **`find-animation-opportunities`** then **`review-animations`** / **`improve-animations`** — motion only where it clarifies the story (build steps advancing, a paid call landing, BLOCKED). Respect `prefers-reduced-motion`. Use **`animation-performance`**: transform/opacity only.
5. **`mobile-native`** — the small meta/CSS fixes so `/` feels right on a phone (judges will open the link on phones).

## Rules
- Fix the top findings from each skill that make the demo or a judge's first 10 seconds better; skip the rest and list them.
- Keep: plain HTML/CSS/vanilla JS, no framework/deps, all dynamic text via `textContent`, existing API/SSE contract unchanged, the 1440×900 `/sell` layout fitting build log + earnings side by side.
- Nit already known: "verified in 1 attempt(s)" — pluralize properly (it's in public JS if the text is built there; if it comes from the server, list it for the coordinator).

## Done when
1. Hand-off has a table: skill → top findings → fixed / skipped (why).
2. `break-ui` cases above render without overflow or broken layout (screenshots at 320, 1440, light + dark; list paths).
3. `npm test` passes; `grep -n innerHTML public/` shows no dynamic data.
4. Pushed: `git pull --rebase --autostash origin build && git push origin HEAD:build`. The coordinator reviews and redeploys.

## OWNER NEEDED
Per `docs/phases/CONTRACT.md`.
