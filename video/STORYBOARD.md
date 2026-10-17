---
compositionId: VendLaunch
duration_s: 40.0 # == audiomap.audio.duration_sec
canvas: { w: 1920, h: 1080, fps: 30 }
grid: 120 BPM generated (beat = 15 frames, bar = 60 frames, downbeats at every even second)
---

# Vend launch film: beat map and frames

Method borrowed from the music-to-video skill: analyze the track once (`audiomap.json`, from
`.agents/skills/music-to-video/scripts/analyze-beatgrid.py`), cut frames at real musical changes,
put the hook on the downbeats.

**Trust call.** The analyzer's robust fields match the arrangement exactly: SURGE at 2 s and 20 s,
DROP at 18 s and 39 s, silences 0–2 / 19–20 / 39–40 s, 9 rolls (rhythmic, so `beat_cut`). Its
tracked tempo reads 117.5 BPM with downbeats ~0.2 s early; the track is synthesized at exactly
120 BPM by `music/make-track.mjs`, so cuts use the generator's grid (`bar(n, beat)` in `src/tokens.ts`).

| Frame | Span (s) | Pacing | Feel (from audiomap) | Treatment | Vocal on the downbeat |
|---|---|---|---|---|---|
| 1 logo | 0–2 | phrase | silence + riser | snapcn BlockWordmark "Vend" | — |
| 2 title | 2–4 | beat_cut | SURGE, kick enters | snapcn TextReveal "Make your agent tool pay for itself." | — |
| 3 build | 4–11 | beat_cut | full groove | hook card, step player + real build log, one line per beat | "Vend it." 4 s, 8 s |
| 4 buyer | 11–14 | beat_cut | groove | snapcn TerminalSimulator, real buyer output | — |
| 5 money | 14–18 | beat_cut | groove | 402 slam, $0.45 roll-up | "Four oh two!" 14 s, "Pay per call." 16 s |
| 6 breakdown | 18–20 | phrase | DROP + silence 19–20 | live /sell ledger push-in | — |
| 7 blocked | 20–26 | beat_cut | SURGE (biggest, +0.86) | red drop: ⛔ BLOCKED, real error, refunded; then the real ledger row | — |
| 8 outro | 26–38 | beat_cut | groove | live site (snapcn ScreenRecording) + snapcn PunchLines chant + credits | "Vend it." 26/30/34/36 s, "Pay per call." 28/32 s |
| 9 end | 38–40 | phrase | DROP 39 s, silence | snapcn WordmarkCut "Vend" | — |
