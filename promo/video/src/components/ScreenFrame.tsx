import {OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {copy} from '../copy';
import {
  getCameraAtFrame,
  getSceneFraming,
  screenBody,
  screenLayout,
  screenPosition,
} from '../framing';
import {theme} from '../theme';
import {SceneTiming, Timeline} from '../timeline';

type ScreenFrameProps = {
  timeline: Timeline;
  timing: SceneTiming;
};

export const ScreenFrame = ({timeline, timing}: ScreenFrameProps) => {
  const frame = useCurrentFrame();
  const framing = getSceneFraming(timeline, timing);
  if (!framing) {
    throw new Error(`${timing.name} does not have footage framing`);
  }
  const {scale, x, y} = getCameraAtFrame(timeline, framing, frame);

  if (
    timing.sourceStartFrame === undefined ||
    timing.sourceEndFrame === undefined ||
    timing.playbackRate === undefined
  ) {
    throw new Error(`${timing.name} is missing footage timing`);
  }

  return (
    <div
      style={{
        position: 'absolute',
        width: screenLayout.frameWidth,
        height: screenBody.height + screenLayout.titleBarHeight,
        left: screenPosition.left,
        top: screenLayout.frameTop,
        overflow: 'hidden',
        border: `1px solid ${theme.hairline}`,
        borderRadius: 20,
        backgroundColor: '#101014',
        boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          height: screenLayout.titleBarHeight,
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#111115',
          borderBottom: `1px solid ${theme.hairline}`,
        }}
      >
        <div style={{display: 'flex', gap: 10, marginLeft: 24}}>
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              style={{width: 12, height: 12, borderRadius: '50%', backgroundColor: '#3F3F46'}}
            />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '7px 28px',
            borderRadius: 999,
            backgroundColor: '#18181C',
            color: theme.secondary,
            fontFamily: theme.mono,
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          {copy.browserUrl}
        </div>
      </div>
      <div style={{position: 'relative', height: screenBody.height, overflow: 'hidden'}}>
        <Sequence
          layout="none"
          from={-timing.sourceStartFrame}
          durationInFrames={timing.sourceStartFrame + timing.duration}
        >
          <OffthreadVideo
            src={staticFile(timeline.video)}
            playbackRate={timing.playbackRate}
            muted
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: screenBody.width,
              height: screenBody.height,
              objectFit: 'cover',
              transformOrigin: 'top left',
              transform: `translate(${x}px, ${y}px) scale(${scale})`,
            }}
          />
        </Sequence>
      </div>
    </div>
  );
};
