import {CalculateMetadataFunction, Composition, staticFile} from 'remotion';
import {Promo, PromoProps} from './Promo';
import {getTotalFrames, OUTPUT_FPS, validateTimeline, VIDEO_HEIGHT, VIDEO_WIDTH} from './timeline';

const calculateMetadata: CalculateMetadataFunction<PromoProps> = async ({abortSignal}) => {
  const response = await fetch(staticFile('demo.timeline.json'), {signal: abortSignal});
  if (!response.ok) {
    throw new Error(`Could not load demo.timeline.json: ${response.status}`);
  }
  const timeline = validateTimeline(await response.json());

  return {
    durationInFrames: getTotalFrames(timeline),
    fps: OUTPUT_FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    props: {timeline},
  };
};

export const RemotionRoot = () => (
  <Composition
    id="Promo"
    component={Promo}
    durationInFrames={1}
    fps={OUTPUT_FPS}
    width={VIDEO_WIDTH}
    height={VIDEO_HEIGHT}
    defaultProps={{timeline: null}}
    calculateMetadata={calculateMetadata}
  />
);
