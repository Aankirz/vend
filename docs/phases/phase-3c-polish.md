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

## Add-on (coordinator): social link preview
When the owner posts the live URL on X/LinkedIn, it must unfurl into a card. Add to both pages: `<meta property="og:title|og:description|og:image|og:url">` and `twitter:card=summary_large_image`, with `og:image` = absolute URL `https://production-vend-gateway.tyzo.nodeops.app/og.png`. Make `public/og.png` (1200×630) by rendering a small HTML card in Vend's style (headline "Make your agent tool pay for itself.", the 402 → pay → 200 terminal motif, "Stripe Projects × CreateOS") with headless Chrome — no external image service. Keep it under 300 KB.

## Add-on 2 (coordinator): "Try a paid call" button
Another builder is adding `POST /api/try/:toolId` (see docs/phases/phase-5-try-it.md for the response shape: steps request → 402 → paid → result, plus `{"evil":true}` for BLOCKED). On `/` next to each live tool, add **Try a paid call** and **Try a malicious call** buttons that animate those steps (402 badge, paid pi_…, then the chart image from base64 — or ⛔ BLOCKED · refunded), handle 429 gracefully, and keep everything via textContent / `img.src = 'data:image/png;base64,' + result` (validate it's base64). This is the judges' hands-on moment: make it the most delightful interaction on the site. If the endpoint isn't merged yet, build against the documented shape and say so.

## Add-on 3 (coordinator) — OWNER ART DIRECTION, overrides the polish-only scope
The owner looked at the live site: "the design looks really naive." Redesign `/` (and bring `/sell` into the same language) with this direction:
- **Stripe-inspired + CreateOS-inspired**, with **Vercel / shadcn** restraint: Stripe's confident gradients-on-white, precise type and layered product shots; CreateOS's dark, technical, terminal-first feel. Study stripe.com, createos.sh, vercel.com first (5 min). Check https://getdesign.ai for ready DESIGN.md files of these brands and use them as tokens/reference if available.
- **Isometric illustrations, pencil-drawn**: inline SVG, hand-sketched line quality (reuse the pencil filter technique in `docs/vend-plan.html` — `feTurbulence` + `feDisplacementMap`), isometric grid. Hero scene tells the story left→right: a seller's code block → an isometric **sandbox cube with a padlock** (CreateOS, network locked) → a **toll booth / gateway** with a "402" sign (Stripe) → an **AI agent** dropping a coin → a chart coming out; small "+$0.45" floating. Reuse the same isometric pieces as icons in the 3-step section. Subtle motion only (a coin drop, the padlock clicking) and none under `prefers-reduced-motion`.
- Keep it fast (inline SVG, no image generation services, no new deps), light + dark, 375px works, all existing behaviour and the Try-it buttons from Add-on 2.
- More inspiration if useful: supahero.io (hero sections), cta.gallery, navbar.gallery, 60fps.design (interaction details).
New deadline for this phase: **push by 04:50 IST** — ship the hero + steps redesign first, then /sell, then the rest.

## Add-on 4 (coordinator) — style reference: https://colorfigures.vercel.app/ (April Zhu)
Hand-inked isometric figures you can play with (← → switches figures). **This is the illustration style to match** — ink line weight, flat fills with a few spot colors, slight hand wobble, labelled "Fig. 0X" captions, interactive. It has a **vending machine (Fig. 03)** — Vend's metaphor.
- Make Vend's hero centrepiece **our own hand-drawn isometric vending machine** in that spirit: the slots are tools ("chart · $0.50"), an AI agent drops a coin (402 → pay), a padlocked sandbox cube sits inside/behind it (CreateOS, network locked), the Stripe-style receipt prints out, the chart drops into the tray. Hover/click to make it vend (coin drop → item drops); respect reduced motion.
- **Draw it yourself in SVG. Do not copy, trace or hotlink their artwork or code** — it's someone else's work; reference the style only. Add "Illustration style inspired by Colorfigures by April Zhu" in the footer.
- The 3-step icons ("Fig. 01 Paste", "Fig. 02 Verify", "Fig. 03 Get paid") use the same ink style and "Fig." caption convention.
