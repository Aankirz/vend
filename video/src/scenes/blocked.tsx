// 20–24 s: the drop. A tool call that reached for the network is blocked and refunded.
// The error text is the one the live site recorded (public/capture/sell-ledger.png, ledger row 1).
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { BEAT, color, ease, font } from '../tokens'
import { Punch } from './parts'

const ERROR = 'network blocked: <urlopen error [Errno -3] Temporary failure in name resolution>'

export function BlockedDrop() {
  const f = useCurrentFrame()
  // Strobe the ground for the first beat: red, deep red, red. Hard, like the bass.
  const ground = f < BEAT ? (Math.floor(f / 3) % 2 ? color.blockedDeep : color.blocked) : color.blocked
  const errChars = Math.floor(interpolate(f, [BEAT * 2, BEAT * 4], [0, ERROR.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const refundIn = interpolate(f, [BEAT * 5, BEAT * 5 + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out })
  return (
    <AbsoluteFill style={{ background: ground, alignItems: 'center', justifyContent: 'center', gap: 56 }}>
      <Punch size={250} ink={color.accentInk} from={1.4}>⛔ BLOCKED</Punch>
      <div style={{ fontFamily: font.mono, fontSize: 34, color: color.accentInk, opacity: 0.9, height: 46, maxWidth: 1600, textAlign: 'center' }}>{ERROR.slice(0, errChars)}</div>
      <div style={{ fontFamily: font.mono, fontSize: 64, fontWeight: 600, color: color.blocked, background: color.accentInk, padding: '14px 30px', borderRadius: 10, opacity: refundIn, transform: `scale(${0.9 + 0.1 * refundIn})` }}>
        ↩ refunded −$0.50
      </div>
    </AbsoluteFill>
  )
}
