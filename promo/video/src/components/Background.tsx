import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';

export const Background = () => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const motionEndFrame = Math.max(1, durationInFrames - Math.round(fps * 1.2));
  const driftX = interpolate(frame, [0, motionEndFrame], [-80, 40], {
    extrapolateRight: 'clamp',
  });
  const driftY = interpolate(frame, [0, motionEndFrame], [-70, 20], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: theme.background, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: -360,
          top: -420,
          width: 1400,
          height: 1400,
          transform: `translate(${driftX}px, ${driftY}px)`,
          background:
            'radial-gradient(circle, rgba(79,70,229,0.18) 0%, rgba(79,70,229,0.09) 38%, rgba(79,70,229,0) 72%)',
        }}
      />
    </AbsoluteFill>
  );
};
