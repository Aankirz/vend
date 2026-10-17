// Small shared pieces: a full-frame ground, a punched-in word, and a beat flash.
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { color, ease, font } from '../tokens'

export function Ground({ bg = color.graphite, children, style }: { bg?: string; children?: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center', ...style }}>{children}</AbsoluteFill>
}

// Lands at full size in ~5 frames from 115%, then keeps a slow push for as long as it holds.
export function Punch({ children, size = 220, ink = color.graphiteInk, from = 1.15, push = 0.04, family = font.display, delay = 0 }: {
  children: ReactNode; size?: number; ink?: string; from?: number; push?: number; family?: string; delay?: number
}) {
  const f = useCurrentFrame() - delay
  const land = interpolate(f, [0, 5], [from, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out })
  const drift = interpolate(f, [5, 90], [0, push], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  // A hard cut shows the word on the cut frame itself: no fade, only the scale lands.
  const opacity = f >= 0 ? 1 : 0
  return (
    <div style={{ fontFamily: family, fontWeight: 700, fontSize: size, lineHeight: 0.95, letterSpacing: '-0.045em', color: ink, transform: `scale(${land + drift})`, opacity, textAlign: 'center' }}>
      {children}
    </div>
  )
}

// A one-frame-bright flash that decays over a beat: the visual kick drum.
export function BeatFlash({ every = 15, strength = 0.08, tint = color.accentInk }: { every?: number; strength?: number; tint?: string }) {
  const f = useCurrentFrame() % every
  const o = interpolate(f, [0, 6], [strength, 0], { extrapolateRight: 'clamp' })
  return <AbsoluteFill style={{ background: tint, opacity: o, pointerEvents: 'none' }} />
}

export function Label({ children, ink = color.graphiteMuted, size = 28 }: { children: ReactNode; ink?: string; size?: number }) {
  return <div style={{ fontFamily: font.mono, fontSize: size, letterSpacing: '0.08em', textTransform: 'uppercase', color: ink }}>{children}</div>
}
