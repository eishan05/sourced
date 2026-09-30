import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {captionLayout, getCaptionPlacement, getSceneFraming} from '../framing';
import {theme, type} from '../theme';
import {getCaptionMinimumFrames, SceneTiming, Timeline} from '../timeline';

type CaptionProps = {
  children: string;
  durationInFrames: number;
  timeline: Timeline;
  timing: SceneTiming;
  frameOffset?: number;
  width?: number;
  height?: number;
  dot?: boolean;
};

export const Caption = ({
  children,
  durationInFrames,
  timeline,
  timing,
  frameOffset = 0,
  width = captionLayout.width,
  height = captionLayout.height,
  dot = true,
}: CaptionProps) => {
  const frame = useCurrentFrame();
  const minimumFrames = getCaptionMinimumFrames(children);
  if (durationInFrames < minimumFrames) {
    throw new Error(
      `${timing.name} caption needs ${minimumFrames} frames but only has ${durationInFrames}`,
    );
  }
  const framing = getSceneFraming(timeline, timing);
  if (!framing) {
    throw new Error(`${timing.name} does not have caption framing`);
  }
  const placement = getCaptionPlacement({
    timeline,
    framing,
    frame: frame + frameOffset,
    width,
    height,
  });
  if (!placement.clean) {
    throw new Error(`${timing.name} has no clean caption anchor at frame ${frame + frameOffset}`);
  }
  const entranceFrames = Math.round(timeline.fps / 3);
  const exitFrames = Math.round(timeline.fps * (4 / 15));
  const entrance = interpolate(frame, [0, entranceFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - exitFrames), durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: placement.rect.x,
        top: placement.rect.y,
        width: placement.width,
        height: placement.height,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 18,
        boxSizing: 'border-box',
        padding: '28px 36px',
        border: `1px solid ${theme.hairline}`,
        borderRadius: 20,
        backgroundColor: 'rgba(9,9,12,0.82)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        color: theme.text,
        opacity: entrance * exit,
        transform: `translateY(${(1 - entrance) * 20}px)`,
        ...type.caption,
      }}
    >
      {dot ? (
        <span
          style={{
            width: 10,
            height: 10,
            marginTop: 18,
            borderRadius: '50%',
            flex: '0 0 auto',
            backgroundColor: theme.accent,
            boxShadow: '0 0 24px rgba(129,140,248,0.55)',
          }}
        />
      ) : null}
      <span>{children}</span>
    </div>
  );
};
