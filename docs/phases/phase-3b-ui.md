# Phase 3b — UI taste pass (landing + seller page)

You are a builder on Vend (deadline 06:00 IST). Read `PLAN.md`, `docs/phases/CONTRACT.md`, `docs/phases/phase-3-app.md`. You own **`public/**` only**. Do not edit `src/**` (another builder owns it); if the UI needs a new API field, say so in your hand-off.

## First, before writing any UI
1. Invoke the **`hallmark`** skill (anti-AI-slop design; use its audit/redesign flow on the current `public/index.html` and `public/sell.html`).
2. Invoke the **`impeccable`** skill (polish: hierarchy, typography, spacing, color, motion, micro-interactions, states, accessibility).
3. Study **https://bencho.dev** (interactive micro-interaction library — React, we are vanilla JS: borrow the idea, not the code). Pick **at most 3** interactions that make Vend's story clearer, e.g.:
   - "Generate"/press feedback on **Vend it**,
   - a **step player** feel for the build log (writing → testing → ✗ failed → fixing → ✅ green → 🔒 network locked → live),
   - a satisfying tick when a paid call lands (earnings counter rolls up; refunded and BLOCKED rows are visually distinct).

## Build
- Redesign `public/index.html` and `public/sell.html` (and any `public/*.css|*.js`) per the two skills. The story the page must tell in 5 seconds: *paste a tool → it's verified in a sandbox → agents pay per call; you get 90%*.
- The seller page is the demo screen: on a 1440×900 recording it must show the build log and the earnings/trust panel side by side without scrolling.
- Keep: plain HTML/CSS/vanilla JS, no framework, no build step; light + dark via CSS custom properties on `:root`; `prefers-reduced-motion` respected; works at 375px; all dynamic strings via `textContent` (never `innerHTML` with data); existing API calls/SSE unchanged.

## Not in this phase
Server/API changes, new dependencies, React, images that need generation, copy rewrites of the README.

## Done when
1. Both skills were invoked; your hand-off lists the hallmark audit findings and what you changed for each.
2. `npm start` → `/` and `/sell` look intentional at 375, 768, 1440 in light and dark (take screenshots with the browser tooling you have and list their paths).
3. Running a build (local runner is fine) and a buyer call shows the step-player log and the earnings tick live; refunded/BLOCKED rows are distinct.
4. No `innerHTML` with dynamic data (`grep -n innerHTML public/`), `npm test` passes, pushed (`git push origin HEAD:build`; coordinator mirrors to main).

## Gate / OWNER NEEDED
`npm test`. OWNER NEEDED protocol per CONTRACT.md.

## Also fix (from review round 1)
- `public/sell.html:193-195`: a blocked call fires `call.paid` → `call.blocked` → `call.refunded`; the row ends as "refunded" and the demo's BLOCKED moment is lost. Keep `blocked` sticky and render "⛔ BLOCKED · refunded".
- `sell.html:155-159`: an early `build.log` line can arrive before the 202 and gets cleared — don't clear lines for the current job.
- `sell.html:213-219`: backlog replay fires up to 50 `/api/stats` requests — refresh stats once after replay.
- For local test builds use `VEND_RUNNER=local` (do not create CreateOS sandboxes — quota).
