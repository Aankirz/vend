# Phase 6 — The submission demo video (2–3 min), fully produced by agents

You are a builder on Vend (deadline 06:00 IST; the final MP4 must exist by **05:20 IST**). You own **`demo/**` only**. Read `docs/SUBMISSION.md` (the script) and `PLAN.md`. Live site: https://production-vend-gateway.tyzo.nodeops.app. Another builder is redesigning `public/**` and will be deployed ~05:05; a third is making a separate music video in `video/**` — don't touch either.

## Build
1. **Screen recordings, automated (no manual screen capture):** Playwright with **video recording** (`recordVideo`, 1920×1080, Chrome at `/Applications/Google Chrome.app`) driving the **live** site:
   - `/` hero → scroll to live tools.
   - `/sell`: Load example → name `chart` → price 0.50 → admin token from `.env` (`VEND_ADMIN_TOKEN`, last line) → **Vend it** → record the whole real build (network locked → test failed → fixing → ✅ → live). This uses the one reusable CreateOS sandbox — run it **once** for the final take (dry-run everything else against a local server with `VEND_RUNNER=local`).
   - Buyer: a terminal segment (render a real terminal capture: run `node scripts/buyer.js <live>/t/<id> '<revenue json>'` and record it with a terminal recorder such as `asciinema`+`agg` if available, else render the real captured output into a terminal mockup HTML page and record that) showing **402 → paying → 200 + receipt**, then `/sell` earnings tick.
   - Malicious call (`source_url` to an outside host) → ⛔ BLOCKED → refunded on `/sell`.
   - Stripe proof: `stripe payment_intents list --limit 3` / `stripe refunds list --limit 1` output (test mode, key via `--api-key` from `.env`; **never show the key** — redact any `sk_` in frames).
   - If the redesign deploys before 05:05, re-record `/` on the new design; otherwise use the current one. Do not wait past 05:05.
2. **Voiceover:** write the narration from `docs/SUBMISSION.md` (keep it tight, ~2:20 total); synthesize with macOS `say` using the best installed English voice (list with `say -v '?'`; prefer a Premium/Enhanced voice if present), export AIFF→WAV. Plain, confident, no hype words.
3. **Owner on camera:** leave two slots — `demo/owner/intro.mov` (~15 s, before the product) and `demo/owner/outro.mov` (~15 s, at the end). If the files are absent at render time, render with a title card in each slot ("[Owner intro]") **and** produce the version without slots too, so the coordinator can swap in clips with one command: `npm --prefix demo run final` (ffmpeg concat).
4. **Edit with ffmpeg:** cut to the narration, 1080p30 H.264 + AAC, lower-third captions for key moments (402, network locked, BLOCKED, refunded), soft background music optional (only generated in-repo; you may reuse `video/public/track.wav` at low volume if it exists). Output `demo/out/vend-demo.mp4` (< 2:45, < 100 MB) and `demo/out/vend-demo-noslots.mp4`.
5. `demo/README.md`: how to re-record and re-render, and the one-command swap-in for the owner clips.

## Not in this phase
Changes outside `demo/**`; uploading anywhere; anything that spends money; creating more than one CreateOS sandbox build on the live site (one final take).

## Done when
1. `demo/out/vend-demo.mp4` plays with voice, 2:00–2:45, every screen is the real product (no fake numbers), no secrets visible (`sk_`, `vck_`, `skp_`, admin token).
2. The intro/outro slot swap works with one command when the owner drops `intro.mov` / `outro.mov` in `demo/owner/`.
3. `.gitignore` keeps `demo/out/*.mp4` and `demo/owner/*` out of git; scripts are committed. Pushed: `git pull --rebase --autostash origin build && git push origin HEAD:build`.

## OWNER NEEDED
Per CONTRACT.md. If macOS asks for Screen Recording or Accessibility permission, don't work around it — use Playwright's own recording instead.
