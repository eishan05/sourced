import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {Background} from './components/Background';
import {Fonts} from './components/Fonts';
import {CodeScene} from './scenes/CodeScene';
import {ConditionalsScene} from './scenes/ConditionalsScene';
import {CtaScene} from './scenes/CtaScene';
import {EvidenceScene} from './scenes/EvidenceScene';
import {FillScene} from './scenes/FillScene';
import {GhostsScene} from './scenes/GhostsScene';
import {PasteScene} from './scenes/PasteScene';
import {ReviewScene} from './scenes/ReviewScene';
import {SubmitScene} from './scenes/SubmitScene';
import {TitleScene} from './scenes/TitleScene';
import {getScenePlan, SceneTiming, Timeline, TITLE_CROSSFADE_FRAMES} from './timeline';

export type PromoProps = {timeline: Timeline | null};

const PasteCrossfade = ({timeline, timing}: {timeline: Timeline; timing: SceneTiming}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, TITLE_CROSSFADE_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{opacity}}>
      <PasteScene timeline={timeline} timing={timing} />
    </AbsoluteFill>
  );
};

const renderScene = (timeline: Timeline, timing: SceneTiming) => {
  switch (timing.name) {
    case 'title':
      return <TitleScene durationInFrames={timing.duration} />;
    case 'paste':
      return <PasteCrossfade timeline={timeline} timing={timing} />;
    case 'fill':
      return <FillScene timeline={timeline} timing={timing} />;
    case 'evidence':
      return <EvidenceScene timeline={timeline} timing={timing} />;
    case 'ghosts':
      return <GhostsScene timeline={timeline} timing={timing} />;
    case 'conditionals':
      return <ConditionalsScene timeline={timeline} timing={timing} />;
    case 'review':
      return <ReviewScene timeline={timeline} timing={timing} />;
    case 'submit':
      return <SubmitScene timeline={timeline} timing={timing} />;
    case 'code':
      return <CodeScene />;
    case 'cta':
      return <CtaScene />;
  }
};

export const Promo = ({timeline}: PromoProps) => {
  if (!timeline) {
    return null;
  }

  return (
    <AbsoluteFill>
      <Fonts />
      <Background />
      {getScenePlan(timeline).map((timing) => (
        <Sequence
          key={timing.name}
          name={timing.name}
          from={timing.start}
          durationInFrames={timing.duration}
          premountFor={15}
        >
          {renderScene(timeline, timing)}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
