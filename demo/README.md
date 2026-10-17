# Vend demo video

Everything here is produced by scripts: Playwright records the real product, macOS `say` reads the narration, ffmpeg cuts it.

## Swap in the owner clips (one command)

Drop `intro.mov` (~15 s, before the product) and `outro.mov` (~15 s, at the end) into `demo/owner/` (`.mp4`/`.m4v` also work), then:

```sh
npm --prefix demo run final
```

This rebuilds `out/vend-demo.mp4` (intro → product → outro) and `out/vend-demo-noslots.mp4` from the already-rendered clips. A missing clip keeps its "[Owner intro]" / "[Owner outro]" title card.

## Re-record and re-render

```sh
npm --prefix demo install          # playwright-core; postinstall raises its 1 Mbps recording bitrate
cd demo
LIVE=https://production-vend-gateway.tyzo.nodeops.app
node scripts/record.js $LIVE build hero try stripe projects
npm run render                     # voice + captions + clips + both finals
```

- `build` runs a real build on the CreateOS sandbox: one take only. Dry-run against a local server first:
  `VEND_RUNNER=local VEND_DATA_DIR=demo/build/data PORT=4790 node src/server.js`, then record with `http://localhost:4790`.
- `try` films the home page's "Try a paid call" then "Try a malicious call" buttons (real 402 → Stripe test payment → chart, then BLOCKED → refund) with `/sell` filmed alongside on the same clock. It needs a live tool.
- `buy` / `evil` / `term-buy` / `term-evil` (unused in the current cut) run `scripts/buyer.js` from a terminal instead; override the tool with `TOOL_URL=<live>/t/<id>`.
- `term-*`, `stripe`, `projects` replay real captured command output in a terminal page. Every captured string goes through `redact()` in `scripts/lib.js` (`sk_`, `vck_`, `skp_`, the admin token, emails).
- If `build/build.json` is absent, the edit uses `build-start` (the filmed click-through) plus `replay` (`/sell` replaying that build's log with each stage highlighted). The build's fail → fix → pass beats are zoomed onto the log (`logBox` in `build/build.json`).

Narration and captions live in `scripts/narration.js`; each beat is a stretch of a recording retimed to its spoken line.
Voice: Samantha (best English voice installed). Music: `video/public/track.wav` at 5% if present.
