import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {copy} from '../copy';
import {springConfig, theme} from '../theme';

const enter = (frame: number, fps: number, delay: number) =>
  spring({
    frame: frame - delay * fps,
    fps,
    config: springConfig,
    durationInFrames: fps,
  });

export const CtaScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const wordmark = enter(frame, fps, 0);
  const sub = enter(frame, fps, 0.2);
  const url = enter(frame, fps, 0.4);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: theme.text,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: theme.inter,
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            opacity: wordmark,
            transform: `translateY(${(1 - wordmark) * 20}px)`,
          }}
        >
          {copy.ctaWordmark.slice(0, -1)}
          <span style={{color: theme.accent}}>{copy.ctaWordmark.slice(-1)}</span>
        </div>
        <div
          style={{
            marginTop: 24,
            color: theme.secondary,
            fontFamily: theme.inter,
            fontSize: 36,
            fontWeight: 400,
            lineHeight: 1.25,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 20}px)`,
          }}
        >
          {copy.ctaSub}
        </div>
        <div
          style={{
            marginTop: 32,
            color: theme.accent,
            fontFamily: theme.mono,
            fontSize: 32,
            fontWeight: 500,
            lineHeight: 1.25,
            opacity: url,
            transform: `translateY(${(1 - url) * 20}px)`,
          }}
        >
          {copy.ctaUrl}
        </div>
      </div>
    </AbsoluteFill>
  );
};
