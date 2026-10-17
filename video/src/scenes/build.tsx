// 5–11 s: the seller's build, as the /sell step player with the real log beside it.
// Log lines are copied from the live site's build of the chart tool (public/capture/sell.png).
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { BEAT, color, ease, font } from '../tokens'
import { Label } from './parts'

type Kind = 'muted' | 'plain' | 'lock' | 'fail' | 'ok' | 'live'
// [line, kind, step it advances, beat it lands on]
const LOG: [string, Kind, number, number][] = [
  ['creating sandbox', 'muted', 0, 0],
  ['writing wrapper', 'muted', 1, 1],
  ['network locked', 'lock', 2, 2],
  ['running 5 tests', 'plain', 3, 3],
  ['test failed: test_valid_chart_roundtrip', 'fail', 3, 4],
  ['fixing', 'muted', 4, 6],
  ['running 5 tests', 'plain', 4, 7],
  ['✅ 5/5 passed', 'ok', 5, 8],
  ['starting server', 'muted', 6, 9],
  ['live ✅', 'live', 6, 10],
]
const STEPS = ['Sandbox', 'Write', 'Lock net', 'Test', 'Fix ×1', 'Green', 'Live']
const INK: Record<Kind, string> = { muted: color.graphiteMuted, plain: color.graphiteInk, lock: color.refund, fail: color.fail, ok: color.paid, live: color.paid }

function stepState(i: number, beat: number) {
  const reached = LOG.filter(([, , step, b]) => b <= beat).map(([, , step]) => step)
  const top = reached.length ? Math.max(...reached) : -1
  const failing = i === 3 && beat >= 4 && beat < 7
  if (failing) return 'fail'
  if (i < top || (i === top && beat >= 10) || (i === 5 && beat >= 8)) return 'done'
  if (i === top) return 'active'
  return 'pending'
}

function Step({ label, state, index }: { label: string; state: string; index: number }) {
  const fill = state === 'done' ? color.paidDeep : state === 'fail' ? color.blocked : 'transparent'
  const ring = state === 'pending' ? color.graphiteRule : state === 'active' ? color.accentBright : fill
  const glyph = state === 'done' ? '✓' : state === 'fail' ? '✗' : String(index + 1)
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 18, width: 200 }}>
      <div style={{ width: 84, height: 84, borderRadius: 42, border: `4px solid ${ring}`, background: fill, display: 'grid', placeItems: 'center', fontFamily: font.mono, fontSize: 36, fontWeight: 600, color: state === 'pending' ? color.graphiteMuted : color.accentInk }}>{glyph}</div>
      <div style={{ fontFamily: font.mono, fontSize: 26, color: state === 'pending' ? color.graphiteMuted : color.graphiteInk }}>{label}</div>
    </div>
  )
}

export function BuildScene() {
  const frame = useCurrentFrame()
  const beat = Math.floor(frame / BEAT)
  const visible = LOG.filter(([, , , b]) => b <= beat)
  return (
    <AbsoluteFill style={{ background: color.graphite, padding: '110px 140px', gap: 70 }}>
      <Label>2 · Verified in a sandbox</Label>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {STEPS.map((s, i) => <Step key={s} label={s} index={i} state={stepState(i, beat)} />)}
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 40, lineHeight: 1.55, display: 'grid', alignContent: 'start' }}>
        {visible.slice(-6).map(([text, kind, , b]) => {
          const local = frame - b * BEAT
          const y = interpolate(local, [0, 6], [14, 0], { extrapolateRight: 'clamp', easing: ease.out })
          return <div key={`${b}-${text}`} style={{ color: INK[kind], transform: `translateY(${y}px)`, fontWeight: kind === 'live' ? 600 : 400 }}>{text}</div>
        })}
      </div>
    </AbsoluteFill>
  )
}
