import { Composition } from 'remotion'
import { DURATION, FPS } from './tokens'
import { VendLaunch } from './VendLaunch'
import { VendLaunchVertical } from './Vertical'

export function Root() {
  return (
    <>
      <Composition id="VendLaunch" component={VendLaunch} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
      <Composition id="VendLaunchVertical" component={VendLaunchVertical} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    </>
  )
}
