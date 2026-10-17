# Phase 4 — Launch music video (Remotion + snapcn)

You are a builder on Vend (deadline 06:00 IST; this video must be rendered by **05:15 IST**). You own **`video/**` only** (a self-contained Remotion project with its own package.json — do not touch the root package.json or `src/`/`public/`).

## References (study first, 5 minutes max)
- Void's launch music video (x.com/cnakazawa/status/2110743237275328905): a catchy song with one chantable hook ("INTO THE VOID"), hard cuts on the beat, real product on screen. Comments quote the hook — that is the goal.
- **snapcn** (https://snapcn.dev): shadcn registry of 46 Remotion components (text reveals, kinetic titles, terminal/laptop mockups, metric counters, logo stings, scenes). Install with `npx shadcn@latest add @snapcn/<name>` into `video/components/snap-cn/`. Read their docs page for the exact setup; never invent component names — list them from the registry.
- Invoke the **hallmark** and **impeccable** skills for visual direction; match Vend's site (`public/styles.css` tokens: Inter + JetBrains Mono, the blue accent, dark terminal panels).

## Build
1. `video/` Remotion project (pin exact versions), 1920×1080 @ 30fps, **35–45 s**, plus a 1080×1920 vertical cut if time allows.
2. **Music, fully owned (no copyrighted audio, no paid service):** generate the track in code — a Node script `video/music/make-track.mjs` that synthesizes a 120–128 BPM WAV (kick, clap, bass line, a bright synth arpeggio/hook) with plain PCM math, and a vocal hook made with macOS `say` (e.g. a voice chanting **"Vend it."** / **"Pay per call."** / **"Four-oh-two!"**), pitched/chopped with `ffmpeg` onto the beat. Keep it catchy and short; the hook repeats 3–4 times. Export `video/public/track.wav`.
3. **Real product footage:** capture stills/short clips of the live site https://production-vend-gateway.tyzo.nodeops.app (`/` and `/sell` at 1920×1080, light) with headless Chrome/Playwright, plus terminal frames recreated with a snapcn terminal component using the **real** output lines from the build log (`creating sandbox → network locked → running 5 tests → test failed → fixing → ✅ 5/5 passed → live ✅`) and the buyer (`402 Payment Required · pay $0.50 → 200 OK chart.png → seller +$0.45`) and the BLOCKED line. Do not fake numbers that contradict the product.
4. Storyboard (cut on the beat):
   - 0–4s logo sting "Vend" → kinetic title **"Make your agent tool pay for itself."**
   - 4–12s paste tool → sandbox spins up → **network locked 🔒** → test fails ✗ → fixing → ✅ green (step-player)
   - 12–20s agent calls → **402** slams on screen → pays → chart appears → counter rolls **+$0.45**
   - 20–27s evil call → **⛔ BLOCKED → refunded** (hard cut, bass drop)
   - 27–35s hero shot of the live site + "Stripe Projects × CreateOS" + URL; hook chant over the outro.
5. Render to `video/out/vend-launch.mp4` (H.264, AAC, < 50 MB) and a poster frame `video/out/poster.png`. `npm run render` in `video/` reproduces it.
6. `video/README.md`: how to re-render, credits (snapcn, Remotion), music is generated in-repo.

## Not in this phase
Any change outside `video/`; voice-over of the owner (they record the on-camera video separately); paid music/AI services; uploading anywhere.

## Done when
1. `video/out/vend-launch.mp4` exists, 35–45 s, plays with audio (`ffprobe` shows both streams), under 50 MB.
2. The hook is audible and repeats; cuts land on the beat.
3. Every screen shown is real Vend UI or real log/terminal output.
4. Rendering does not need network beyond installing packages; `.gitignore` excludes `video/node_modules` and `video/out/*.mp4` if > 20 MB (keep the poster).
5. Pushed (`git push origin HEAD:build`); hand-off lists the file path and the snapcn components used.

## OWNER NEEDED
Per CONTRACT.md. If Remotion needs a browser download, use the installed Google Chrome (`/Applications/Google Chrome.app`) via Remotion's browser-executable option first.
