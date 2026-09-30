import {
  markInScene,
  OUTPUT_FPS,
  Region,
  RegionName,
  SceneTiming,
  Timeline,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from './timeline';

export const screenLayout = {
  frameWidth: 1700,
  titleBarHeight: 56,
  frameTop: 26,
} as const;

export const screenBody = {
  width: screenLayout.frameWidth,
  height: screenLayout.frameWidth * (9 / 16),
} as const;

export const screenPosition = {
  left: (VIDEO_WIDTH - screenLayout.frameWidth) / 2,
  bodyTop: screenLayout.frameTop + screenLayout.titleBarHeight,
} as const;

export const captionLayout = {
  safe: 96,
  width: 1100,
  fallbackWidth: 900,
  height: 160,
} as const;

export type CameraSpec = {
  region?: RegionName;
  coverage?: number;
  scale?: number;
  offsetY?: number;
};

export type FramingSpec = {
  from?: CameraSpec;
  to?: CameraSpec;
  transitionStart: number;
  transitionDuration: number;
};

export type Camera = {scale: number; x: number; y: number};
export type Rect = {x: number; y: number; w: number; h: number};
export type CaptionAnchor = 'top-left' | 'bottom-left';

const secondsToFrames = (seconds: number) => Math.round(seconds * OUTPUT_FPS);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

const visibleRegion = (timeline: Timeline, name: RegionName): Region => {
  const region = timeline.regions[name];
  return {
    ...region,
    w: Math.min(region.w, timeline.width - region.x),
    h: Math.min(region.h, timeline.height - region.y),
  };
};

const cameraTargetFor = (timeline: Timeline, spec: CameraSpec = {}): Camera => {
  if (!spec.region) {
    const scale = spec.scale ?? 1;
    return {
      scale,
      x: (screenBody.width - screenBody.width * scale) / 2,
      y: (screenBody.height - screenBody.height * scale) / 2,
    };
  }

  const region = visibleRegion(timeline, spec.region);
  const coverage = spec.coverage ?? 0.6;
  const scale =
    spec.scale ??
    Math.min(
      (timeline.width * coverage) / region.w,
      (timeline.height * coverage) / region.h,
    );
  const centerX = ((region.x + region.w / 2) / timeline.width) * screenBody.width;
  const centerY = ((region.y + region.h / 2) / timeline.height) * screenBody.height;

  return {
    scale,
    x: screenBody.width / 2 - centerX * scale,
    y: screenBody.height / 2 - centerY * scale + (spec.offsetY ?? 0),
  };
};

/**
 * Pure coverage guard for a scaled video layer. Scale is raised when needed,
 * then both offsets are constrained so no edge can enter the frame body.
 */
export const clampCameraToCover = (
  camera: Camera,
  dimensions: {
    videoWidth: number;
    videoHeight: number;
    bodyWidth: number;
    bodyHeight: number;
  } = {
    videoWidth: screenBody.width,
    videoHeight: screenBody.height,
    bodyWidth: screenBody.width,
    bodyHeight: screenBody.height,
  },
): Camera => {
  const minimumScale = Math.max(
    1,
    dimensions.bodyWidth / dimensions.videoWidth,
    dimensions.bodyHeight / dimensions.videoHeight,
  );
  const scale = Math.max(minimumScale, camera.scale);
  const scaledWidth = dimensions.videoWidth * scale;
  const scaledHeight = dimensions.videoHeight * scale;

  return {
    scale,
    x: clamp(camera.x, -(scaledWidth - dimensions.bodyWidth), 0),
    y: clamp(camera.y, -(scaledHeight - dimensions.bodyHeight), 0),
  };
};

export const getSceneFraming = (
  timeline: Timeline,
  timing: SceneTiming,
): FramingSpec | null => {
  const standardTransition = secondsToFrames(0.9);

  switch (timing.name) {
    case 'title':
    case 'code':
    case 'cta':
      return null;
    case 'paste':
      return {transitionStart: 0, transitionDuration: standardTransition};
    case 'fill':
      return {
        from: {scale: 1},
        to: {scale: 1.06},
        transitionStart: 0,
        transitionDuration: timing.duration,
      };
    case 'evidence': {
      const requiredHold = secondsToFrames(1.2);
      const settledFrame = markInScene(timeline, timing, 'highlightSettled');
      const transitionEnd = Math.max(
        1,
        Math.min(settledFrame, Math.max(1, timing.duration - requiredHold)),
      );
      const transitionDuration = Math.min(standardTransition, transitionEnd);

      return {
        from: {region: 'chipRow', coverage: 0.55},
        to: {region: 'sourceHighlight', coverage: 0.6},
        transitionStart: transitionEnd - transitionDuration,
        transitionDuration,
      };
    }
    case 'ghosts':
      return {
        from: {region: 'ghostCard', coverage: 0.6},
        transitionStart: 0,
        transitionDuration: standardTransition,
      };
    case 'conditionals':
      return {
        from: {region: 'gateSection', coverage: 0.7},
        transitionStart: 0,
        transitionDuration: standardTransition,
      };
    case 'review':
      return {
        from: {scale: 1},
        to: {region: 'reviewBar', scale: 1.14},
        transitionStart: 0,
        transitionDuration: standardTransition,
      };
    case 'submit':
      return {transitionStart: 0, transitionDuration: standardTransition};
  }
};

export const getCameraAtFrame = (
  timeline: Timeline,
  framing: FramingSpec,
  frame: number,
): Camera => {
  const start = cameraTargetFor(timeline, framing.from);
  const end = cameraTargetFor(timeline, framing.to ?? framing.from);
  const rawProgress =
    framing.transitionDuration <= 0
      ? 1
      : (frame - framing.transitionStart) / framing.transitionDuration;
  const progress = easeInOutCubic(clamp(rawProgress, 0, 1));

  // Clamp after interpolation: transition frames must obey the same coverage
  // constraints as their endpoints.
  return clampCameraToCover({
    scale: start.scale + (end.scale - start.scale) * progress,
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  });
};

export const getActiveRegion = (framing: FramingSpec, frame: number) => {
  const startRegion = framing.from?.region;
  const endRegion = framing.to?.region ?? startRegion;
  if (!endRegion || endRegion === startRegion) {
    return endRegion;
  }
  return frame < framing.transitionStart ? startRegion : endRegion;
};

export const projectRegion = (
  timeline: Timeline,
  regionName: RegionName,
  camera: Camera,
): Rect => {
  const region = visibleRegion(timeline, regionName);
  const unitX = screenBody.width / timeline.width;
  const unitY = screenBody.height / timeline.height;

  return {
    x: screenPosition.left + camera.x + region.x * unitX * camera.scale,
    y: screenPosition.bodyTop + camera.y + region.y * unitY * camera.scale,
    w: region.w * unitX * camera.scale,
    h: region.h * unitY * camera.scale,
  };
};

export const rectanglesIntersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const captionRect = (anchor: CaptionAnchor, width: number, height: number): Rect => ({
  x: captionLayout.safe,
  y:
    anchor === 'top-left'
      ? captionLayout.safe
      : VIDEO_HEIGHT - captionLayout.safe - height,
  w: width,
  h: height,
});

export const getCaptionPlacement = ({
  timeline,
  framing,
  frame,
  width = captionLayout.width,
  height = captionLayout.height,
}: {
  timeline: Timeline;
  framing: FramingSpec;
  frame: number;
  width?: number;
  height?: number;
}) => {
  const regionName = getActiveRegion(framing, frame);
  const target = regionName
    ? projectRegion(timeline, regionName, getCameraAtFrame(timeline, framing, frame))
    : null;
  const preferred: CaptionAnchor = target ? 'top-left' : 'bottom-left';
  const anchors: CaptionAnchor[] = target
    ? ['top-left', 'bottom-left']
    : ['bottom-left', 'top-left'];

  for (const candidateWidth of [width, captionLayout.fallbackWidth]) {
    for (const anchor of anchors) {
      const rect = captionRect(anchor, candidateWidth, height);
      if (!target || !rectanglesIntersect(rect, target)) {
        return {anchor, width: candidateWidth, height, rect, target, regionName, clean: true};
      }
    }
  }

  const anchor = anchors[0];
  return {
    anchor,
    width: captionLayout.fallbackWidth,
    height,
    rect: captionRect(anchor, captionLayout.fallbackWidth, height),
    target,
    regionName,
    clean: false,
  };
};
