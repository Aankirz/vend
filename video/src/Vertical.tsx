// ponytail: the vertical cut letterboxes the 16:9 film on graphite with the hook on top;
// a re-laid-out vertical edit is the upgrade if the 9:16 version gets real traction.
import { AbsoluteFill } from 'remotion'
import { color, font } from './tokens'
import { VendLaunch } from './VendLaunch'

const SCALE = 1080 / 1920

export function VendLaunchVertical() {
  return (
    <AbsoluteFill style={{ background: color.graphite, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 300, fontFamily: font.display, fontWeight: 700, fontSize: 96, letterSpacing: '-0.04em', color: color.graphiteInk, textAlign: 'center', lineHeight: 1 }}>
        Make your agent tool<br /><span style={{ color: color.accentBright }}>pay for itself.</span>
      </div>
      <div style={{ width: 1920, height: 1080, transform: `scale(${SCALE})`, flex: 'none' }}><VendLaunch /></div>
      <div style={{ position: 'absolute', bottom: 320, fontFamily: font.mono, fontSize: 34, color: color.graphiteMuted }}>Stripe Projects × CreateOS</div>
    </AbsoluteFill>
  )
}
