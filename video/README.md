# Vend launch film (Remotion)

40 s, 1920×1080 @ 30 fps, plus a 1080×1920 vertical cut. A beat-cut music video for Vend.

## Re-render

```bash
cd video
npm install
npm run capture   # optional: re-shoot the live site into public/capture/ (needs Playwright + network)
npm run render    # regenerates public/track.wav, renders out/vend-launch.mp4 and out/poster.png
npm run render:vertical
```

Rendering needs no network once `node_modules` is installed: fonts come from
`@remotion/google-fonts`, footage is in `public/capture/`, the track is generated locally.
If Remotion can't download its headless browser, add
`--browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.

## Music: generated in this repo

`music/make-track.mjs` writes `public/track.wav` with plain PCM math (kick, clap, hats, saw bass,
square arp hook, risers, impacts) at 120 BPM. The vocal hook ("Vend it.", "Pay per call.",
"Four oh two!") is macOS `say` (Samantha + Daniel doubled into a chant), pitched with `ffmpeg`
and placed on downbeats; the beat ducks under it. No samples, no paid service, nothing copyrighted.
`audiomap.json` is the beat map from the music-to-video analyzer; `STORYBOARD.md` maps frames to it.

## What is on screen

Everything is the real product: captures of https://production-vend-gateway.tyzo.nodeops.app
(`/` and `/sell`), the live build log lines, `scripts/buyer.js` output, and the BLOCKED · refunded
row with its recorded error. Colours and fonts are the site's tokens (`src/tokens.ts`).

## Credits

- [snapcn](https://snapcn.dev) (MIT): block-wordmark, text-reveal, terminal-simulator,
  screen-recording, punch-lines, wordmark-cut, in `src/components/snap-cn/` (installed with
  `npx shadcn@latest add @snapcn/<name>`).
- [Remotion](https://www.remotion.dev).
