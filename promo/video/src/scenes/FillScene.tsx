import {AbsoluteFill, Sequence} from 'remotion';
import {Caption} from '../components/Caption';
import {ScreenFrame} from '../components/ScreenFrame';
import {copy} from '../copy';
import {getCaptionDurations, SceneTiming, Timeline} from '../timeline';

export const FillScene = ({timeline, timing}: {timeline: Timeline; timing: SceneTiming}) => {
  const [firstCaption, secondCaption] = getCaptionDurations(timing);
  if (!firstCaption || !secondCaption) {
    throw new Error('Fill scene needs two caption timings');
  }
  const firstCaptionFrames = firstCaption.actualFrames;
  const secondCaptionFrames = secondCaption.actualFrames;

  return (
    <AbsoluteFill>
      <ScreenFrame timeline={timeline} timing={timing} />
      <Sequence durationInFrames={firstCaptionFrames} premountFor={10}>
        <Caption
          timeline={timeline}
          timing={timing}
          durationInFrames={firstCaptionFrames}
          width={420}
          height={112}
        >
          {copy.fillFirst}
        </Caption>
      </Sequence>
      <Sequence from={firstCaptionFrames} durationInFrames={secondCaptionFrames} premountFor={10}>
        <Caption
          timeline={timeline}
          timing={timing}
          durationInFrames={secondCaptionFrames}
          frameOffset={firstCaptionFrames}
        >
          {copy.fillSecond}
        </Caption>
      </Sequence>
    </AbsoluteFill>
  );
};
