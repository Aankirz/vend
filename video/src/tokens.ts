// Hallmark · genre: modern-minimal · theme: Cobalt (mirrors public/styles.css) · format: 40s beat-cut launch film
// pre-emit critique: P4 H5 E4 S5 R4 V4
import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono'
import { Easing } from 'remotion'

const grotesk = loadGrotesk('normal', { weights: ['500', '600', '700'], subsets: ['latin'] })
const inter = loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin'] })
const mono = loadMono('normal', { weights: ['400', '500', '600'], subsets: ['latin'] })

export const font = {
  display: grotesk.fontFamily,
  body: inter.fontFamily,
  mono: mono.fontFamily,
}

// Same values as the site's :root tokens, so the film and the product read as one thing.
export const color = {
  paper: 'oklch(98.5% 0.004 250)',
  ink: 'oklch(24% 0.02 258)',
  graphite: 'oklch(17% 0.016 260)',
  graphite2: 'oklch(22% 0.018 260)',
  graphiteRule: 'oklch(32% 0.02 260)',
  graphiteInk: 'oklch(92% 0.01 255)',
  graphiteMuted: 'oklch(64% 0.016 257)',
  accent: 'oklch(55% 0.2 258)',
  accentBright: 'oklch(68% 0.17 258)',
  accentInk: 'oklch(98.5% 0.006 258)',
  paid: 'oklch(80% 0.14 155)',
  paidDeep: 'oklch(52% 0.13 155)',
  refund: 'oklch(84% 0.12 85)',
  blocked: 'oklch(54% 0.19 27)',
  blockedDeep: 'oklch(38% 0.14 27)',
  fail: 'oklch(74% 0.14 27)',
}

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
}

// 120 BPM at 30 fps: one beat is 15 frames, one bar is 60. Every cut lands on these.
export const FPS = 30
export const BEAT = 15
export const BAR = 60
export const bar = (n: number, beat = 0) => n * BAR + beat * BEAT
export const DURATION = bar(20)

export const SITE_URL = 'production-vend-gateway.tyzo.nodeops.app'
