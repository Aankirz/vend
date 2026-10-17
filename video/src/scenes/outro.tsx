// 26–40 s: the live site, the chant, the credits.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { ScreenRecording } from '@/components/snap-cn/screen-recording'
import { staticFile } from 'remotion'
import { BAR, color, ease, font, SITE_URL } from '../tokens'
import { Label } from './parts'

// Chant captions over the site, landing on the downbeats where the vocal sings them.
const CAPTIONS: [number, string][] = [[0, 'Vend it.'], [BAR, 'Pay per call.']]

export function SiteHero() {
  const f = useCurrentFrame()
  const [, text] = [...CAPTIONS].reverse().find(([at]) => f >= at) ?? CAPTIONS[0]
  const local = f % BAR
  const pop = interpolate(local, [0, 5], [1.12, 1], { extrapolateRight: 'clamp', easing: ease.out })
  return (
    <AbsoluteFill style={{ background: color.paper }}>
      <ScreenRecording
        src={staticFile('capture/home-scroll.mp4')}
        trimBefore={40} // skip the blank page-load frames at the start of the capture
        fit="cover"
        entrance="none"
        backdropColor={color.paper}
        radius={0}
        camera={[{ at: 0, zoom: 1.05, x: 0.5, y: 0.4 }, { at: 60, duration: 60, zoom: 1.25, x: 0.35, y: 0.35 }]}
        mode="light"
      />
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 90 }}>
        <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 120, letterSpacing: '-0.04em', color: color.accentInk, background: color.accent, padding: '10px 44px 22px', borderRadius: 14, transform: `scale(${pop})` }}>{text}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

export function Credits() {
  const f = useCurrentFrame()
  const rise = (d: number) => interpolate(f, [d, d + 8], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out })
  const fade = (d: number) => interpolate(f, [d, d + 6], [0.35, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: color.graphite, alignItems: 'center', justifyContent: 'center', gap: 44 }}>
      <div style={{ opacity: fade(0), transform: `translateY(${rise(0)}px)` }}><Label size={34}>Built on Stripe Projects × CreateOS</Label></div>
      <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 96, letterSpacing: '-0.035em', color: color.graphiteInk, opacity: fade(8), transform: `translateY(${rise(8)}px)` }}>
        Paste a tool. Agents pay per call.
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 44, color: color.accentBright, opacity: fade(16), transform: `translateY(${rise(16)}px)` }}>{SITE_URL}</div>
    </AbsoluteFill>
  )
}
