// 14–20 s: the 402 slam, the paid result, and the seller's +$0.45 rolling up.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { BEAT, color, ease, font } from '../tokens'
import { Ground, Label, Punch } from './parts'

export function Slam402() {
  const f = useCurrentFrame()
  const shake = f < 6 ? Math.sin(f * 2.4) * (6 - f) * 3 : 0
  return (
    <Ground bg={color.accent}>
      <div style={{ transform: `translateX(${shake}px)`, display: 'grid', justifyItems: 'center', gap: 30 }}>
        <Punch size={460} ink={color.accentInk} from={1.35}>402</Punch>
        {f >= BEAT && <Punch size={64} ink={color.accentInk} from={1.08} push={0}><span style={{ fontFamily: font.mono, fontWeight: 500, letterSpacing: '-0.01em' }}>Payment Required · pay $0.50</span></Punch>}
      </div>
    </Ground>
  )
}

const ROLL_FRAMES = 24
const SELLER_CENTS = 45 // 90% of a $0.50 call, exactly what the ledger shows

export function PaidTick() {
  const f = useCurrentFrame()
  const start = BEAT // the number rolls on the second beat, after "200 OK" lands
  const t = interpolate(f, [start, start + ROLL_FRAMES], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out })
  const cents = Math.round(SELLER_CENTS * t)
  const flash = interpolate(f, [start + ROLL_FRAMES, start + ROLL_FRAMES + 18], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const deltaY = interpolate(f, [start + ROLL_FRAMES, start + ROLL_FRAMES + 30], [0, -60], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out })
  return (
    <AbsoluteFill style={{ background: color.graphite, padding: '120px 160px', justifyContent: 'center', gap: 40 }}>
      <div style={{ fontFamily: font.mono, fontSize: 44, color: color.graphiteInk }}>
        <span style={{ color: color.paid }}>200 OK</span> chart.png
      </div>
      <Label>Seller earned</Label>
      <div style={{ position: 'relative', fontFamily: font.display, fontWeight: 600, fontSize: 300, letterSpacing: '-0.04em', lineHeight: 1, color: t >= 1 ? color.paid : color.graphiteInk, fontVariantNumeric: 'tabular-nums' }}>
        ${(cents / 100).toFixed(2)}
        <span style={{ position: 'absolute', left: 760, top: 40, fontFamily: font.mono, fontSize: 64, color: color.paid, opacity: t >= 1 ? flash : 0, transform: `translateY(${deltaY}px)` }}>+$0.45</span>
      </div>
      <div style={{ fontFamily: font.body, fontSize: 40, color: color.graphiteMuted }}>you keep 90% · Vend $0.05</div>
    </AbsoluteFill>
  )
}

// The real /sell page from the live site, pushed in on its earnings panel.
export function LedgerPush({ focus = 'paid' }: { focus?: 'paid' | 'blocked' }) {
  const f = useCurrentFrame()
  const zoom = interpolate(f, [0, 90], [1.9, 2.25], { extrapolateRight: 'clamp' })
  // Ledger panel centre in the 1920x1080 capture: x≈1356, rows at y≈350 (blocked) / 450 (paid).
  const fx = 1356, fy = focus === 'blocked' ? 340 : 330
  return (
    <AbsoluteFill style={{ background: color.paper, overflow: 'hidden' }}>
      <Img src={staticFile('capture/sell-ledger.png')} style={{ width: 1920, height: 1080, transformOrigin: `${fx}px ${fy}px`, transform: `translate(${960 - fx}px, ${540 - fy}px) scale(${zoom})` }} />
    </AbsoluteFill>
  )
}
