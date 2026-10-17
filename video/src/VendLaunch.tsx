// The 40 s launch film. Every Sequence starts on a beat of the generated 120 BPM track
// (see STORYBOARD.md and audiomap.json); bar(n, beat) is the only clock used here.
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion'
import { BlockWordmark } from '@/components/snap-cn/block-wordmark'
import { PunchLines } from '@/components/snap-cn/punch-lines'
import { TerminalSimulator } from '@/components/snap-cn/terminal-simulator'
import { TextReveal } from '@/components/snap-cn/text-reveal'
import { WordmarkCut } from '@/components/snap-cn/wordmark-cut'
import { BlockedDrop } from './scenes/blocked'
import { BuildScene } from './scenes/build'
import { LedgerPush, PaidTick, Slam402 } from './scenes/money'
import { Credits, SiteHero } from './scenes/outro'
import { Ground, Punch } from './scenes/parts'
import { bar, color, font } from './tokens'

const COBALT_SHADES = ['oklch(55% 0.2 258)', 'oklch(68% 0.17 258)', 'oklch(42% 0.17 258)', 'oklch(80% 0.1 258)']

function HookCard({ text = 'Vend it.' }: { text?: string }) {
  return <Ground bg={color.accent}><Punch size={300} ink={color.accentInk}>{text}</Punch></Ground>
}

function HookPill() {
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-end', padding: 70 }}>
      <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 72, letterSpacing: '-0.03em', color: color.accentInk, background: color.accent, padding: '6px 30px 14px', borderRadius: 12 }}>Vend it.</div>
    </AbsoluteFill>
  )
}

// Real output of scripts/buyer.js against the live gateway, plus the ledger split it produced.
const BUYER_LINES = [
  { text: '402 received', type: 'error' as const, delay: 2 },
  { text: 'paying 0.50 USD (test SPT)', type: 'log' as const, delay: 3 },
  { text: '200 OK chart.png', type: 'success' as const, delay: 3 },
  { text: 'seller +$0.45', type: 'success' as const, delay: 2 },
]

const at = (from: number, to: number) => ({ from, durationInFrames: to - from })

export function VendLaunch() {
  return (
    <AbsoluteFill style={{ background: color.graphite }}>
      <Audio src={staticFile('track.wav')} />
      {/* 0–2 s · logo sting */}
      <Sequence {...at(bar(0), bar(1))}>
        <BlockWordmark text="Vend" fontSize={300} fontFamily={font.display} fontWeight={700} color={color.graphiteInk} colors={COBALT_SHADES} background={color.graphite} speed={2.4} mode="dark" />
      </Sequence>
      {/* 2–4 s · kinetic title on the first kick */}
      <Sequence {...at(bar(1), bar(2))}>
        <Sequence from={-8}><TextReveal text="Make your agent tool pay for itself." fontFamily={font.display} fontWeight={600} fontSize={104} color={color.graphiteInk} theme={{ background: color.graphite }} mode="dark" /></Sequence>
      </Sequence>
      {/* 4–5 s · hook #1 */}
      <Sequence {...at(bar(2), bar(2, 2))}><HookCard /></Sequence>
      {/* 5–11 s · paste → sandbox → network locked → ✗ → fixing → ✅ */}
      <Sequence {...at(bar(2, 2), bar(5, 2))}><BuildScene /></Sequence>
      {/* 8 s · hook #2 lands on the downbeat over the build */}
      <Sequence {...at(bar(4), bar(4, 2))}><HookPill /></Sequence>
      {/* 11–14 s · the agent calls */}
      <Sequence {...at(bar(5, 2), bar(7))}>
        <TerminalSimulator intro={null} command={{ managers: ['node'], text: 'node scripts/buyer.js /t/chart' }} lines={BUYER_LINES} fontFamily={font.mono} speed={2.6} mode="dark" theme={{ background: color.graphite, card: color.graphite2, border: color.graphiteRule }} />
      </Sequence>
      {/* 14–16 s · "Four oh two!" */}
      <Sequence {...at(bar(7), bar(8))}><Slam402 /></Sequence>
      {/* 16–18 s · "Pay per call." · the seller's cut rolls up */}
      <Sequence {...at(bar(8), bar(9))}><PaidTick /></Sequence>
      {/* 18–20 s · breakdown: the real ledger on the live site */}
      <Sequence {...at(bar(9), bar(10))}><LedgerPush focus="paid" /></Sequence>
      {/* 20–24 s · the drop: BLOCKED, refunded */}
      <Sequence {...at(bar(10), bar(12))}><BlockedDrop /></Sequence>
      {/* 24–26 s · the same row on the real ledger */}
      <Sequence {...at(bar(12), bar(13))}><LedgerPush focus="blocked" /></Sequence>
      {/* 26–30 s · the live site, chant captions */}
      <Sequence {...at(bar(13), bar(15))}><SiteHero /></Sequence>
      {/* 30–36 s · the chant as title cards, one per downbeat */}
      <Sequence {...at(bar(15), bar(18))}>
        <PunchLines fontSize={150} script="Vend it. | Pay per call. | Vend it." styles="punch" sizes="1.6,1.2,1.6" holds={String(bar(1))} lead={0} accentBeat={2} fontFamily={font.display} fontWeight={700} ground={color.graphite} ink={color.graphiteInk} accentColor={color.accentBright} mode="dark" />
      </Sequence>
      {/* 36–38 s · credits + URL */}
      <Sequence {...at(bar(18), bar(19))}><Credits /></Sequence>
      {/* 38–40 s · end card */}
      <Sequence {...at(bar(19), bar(20))}>
        <Sequence from={-8}><WordmarkCut word="Vend" fontFamily={font.display} dotFrom={color.accent} dotTo={color.accentBright} mode="dark" theme={{ background: color.graphite, foreground: color.graphiteInk }} /></Sequence>
      </Sequence>
    </AbsoluteFill>
  )
}

