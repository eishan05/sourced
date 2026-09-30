import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {copy} from '../copy';
import {springConfig, theme, type} from '../theme';

export const TitleScene = ({durationInFrames}: {durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: springConfig,
    durationInFrames: Math.round(fps * 0.93),
  });
  const secondLine = interpolate(frame, [fps * 1.2, fps * 1.53], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(
    frame,
    [durationInFrames - Math.round(fps / 3), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  return (
    <AbsoluteFill
      style={{
        boxSizing: 'border-box',
        justifyContent: 'center',
        padding: '0 128px',
        opacity: exit,
        color: theme.text,
      }}
    >
      <div
        style={{
          opacity: entrance,
          transform: `translateY(${(1 - entrance) * 24}px)`,
        }}
      >
        <div style={{...type.eyebrow, color: theme.accent, marginBottom: 32}}>
          {copy.title.eyebrow}
        </div>
        <div style={{...type.headline, maxWidth: 1520}}>{copy.title.first}</div>
        <div
          style={{
            ...type.headline,
            maxWidth: 1520,
            marginTop: 18,
            color: theme.secondary,
            opacity: secondLine,
            transform: `translateY(${(1 - secondLine) * 12}px)`,
          }}
        >
          {copy.title.second}
        </div>
      </div>
    </AbsoluteFill>
  );
};
