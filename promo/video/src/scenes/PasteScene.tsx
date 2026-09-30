import {AbsoluteFill} from 'remotion';
import {Caption} from '../components/Caption';
import {ScreenFrame} from '../components/ScreenFrame';
import {copy} from '../copy';
import {SceneTiming, Timeline} from '../timeline';

export const PasteScene = ({timeline, timing}: {timeline: Timeline; timing: SceneTiming}) => (
  <AbsoluteFill>
    <ScreenFrame timeline={timeline} timing={timing} />
    <Caption timeline={timeline} timing={timing} durationInFrames={timing.duration}>
      {copy.paste}
    </Caption>
  </AbsoluteFill>
);
