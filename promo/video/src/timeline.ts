import {copy} from './copy';

export const OUTPUT_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export const markKeys = [
  'start',
  'paste',
  'fillStart',
  'firstField',
  'fillDone',
  'chipClick',
  'highlightSettled',
  'ghostFocus',
  'ghostAccept',
  'gateAnswer',
  'reviewStart',
  'reviewKeys',
  'reviewDone',
  'humanAnswer',
  'submitReady',
  'submitClick',
  'submitted',
  'end',
] as const;

export const regionKeys = [
  'formPane',
  'sourcePane',
  'chipRow',
  'sourceHighlight',
  'ghostCard',
  'gateSection',
  'reviewBar',
  'humanFields',
  'submitSummary',
  'submittedJson',
] as const;

export type MarkName = (typeof markKeys)[number];
export type RegionName = (typeof regionKeys)[number];
export type Region = {x: number; y: number; w: number; h: number};

export type Timeline = {
  version: number;
  fps: number;
  width: number;
  height: number;
  video: string;
  durationMs: number;
  marks: Record<MarkName, number>;
  regions: Record<RegionName, Region>;
  stats: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
};

export const validateTimeline = (value: unknown): Timeline => {
  if (!isRecord(value)) {
    throw new Error('Timeline must be an object');
  }

  const version = finiteNumber(value.version, 'version');
  const fps = finiteNumber(value.fps, 'fps');
  const width = finiteNumber(value.width, 'width');
  const height = finiteNumber(value.height, 'height');
  const durationMs = finiteNumber(value.durationMs, 'durationMs');

  if (fps !== 30 || width !== 2880 || height !== 1620 || durationMs <= 0) {
    throw new Error('Timeline must describe the 2880x1620, 30fps source recording');
  }
  if (typeof value.video !== 'string' || value.video.length === 0) {
    throw new Error('video must be a non-empty filename');
  }
  if (!isRecord(value.marks) || !isRecord(value.regions)) {
    throw new Error('Timeline marks and regions must be objects');
  }

  const marks = {} as Record<MarkName, number>;
  let previous = -1;
  for (const key of markKeys) {
    const current = finiteNumber(value.marks[key], `marks.${key}`);
    if (current < 0 || current > durationMs || current < previous) {
      throw new Error(`marks.${key} must be ordered and within the recording`);
    }
    marks[key] = current;
    previous = current;
  }

  const regions = {} as Record<RegionName, Region>;
  for (const key of regionKeys) {
    const raw = value.regions[key];
    if (!isRecord(raw)) {
      throw new Error(`regions.${key} must be an object`);
    }
    const region = {
      x: finiteNumber(raw.x, `regions.${key}.x`),
      y: finiteNumber(raw.y, `regions.${key}.y`),
      w: finiteNumber(raw.w, `regions.${key}.w`),
      h: finiteNumber(raw.h, `regions.${key}.h`),
    };
    if (
      region.x < 0 ||
      region.y < 0 ||
      region.x >= width ||
      region.y >= height ||
      region.w <= 0 ||
      region.h <= 0
    ) {
      throw new Error(`regions.${key} must intersect the recording and have positive size`);
    }
    regions[key] = region;
  }

  return {
    version,
    fps,
    width,
    height,
    video: value.video,
    durationMs,
    marks,
    regions,
    stats: isRecord(value.stats) ? value.stats : {},
  };
};

export const msToFrame = (milliseconds: number) =>
  Math.round((milliseconds / 1000) * OUTPUT_FPS);

export type SceneName =
  | 'title'
  | 'paste'
  | 'fill'
  | 'evidence'
  | 'ghosts'
  | 'conditionals'
  | 'review'
  | 'submit'
  | 'code'
  | 'cta';

export type SceneTiming = {
  name: SceneName;
  start: number;
  duration: number;
  unadjustedDuration?: number;
  sourceStartFrame?: number;
  sourceEndFrame?: number;
  playbackRate?: number;
};

type CaptionSpec = {
  text: string;
  preferredFrames?: number;
};

export type CaptionDuration = {
  scene: SceneName;
  text: string;
  wordCount: number;
  requiredSeconds: number;
  requiredFrames: number;
  actualFrames: number;
  neededAdjustment: boolean;
};

export const countCaptionWords = (caption: string) => {
  const trimmed = caption.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
};

export const getCaptionMinimumSeconds = (caption: string) =>
  Math.max(1.6, countCaptionWords(caption) * 0.32);

export const getCaptionMinimumFrames = (caption: string) =>
  Math.ceil(getCaptionMinimumSeconds(caption) * OUTPUT_FPS);

const getCaptionSpecs = (scene: SceneName): CaptionSpec[] => {
  switch (scene) {
    case 'paste':
      return [{text: copy.paste}];
    case 'fill':
      return [
        {text: copy.fillFirst, preferredFrames: Math.round(1.2 * OUTPUT_FPS)},
        {text: copy.fillSecond},
      ];
    case 'evidence':
      return [{text: copy.evidence}];
    case 'ghosts':
      return [{text: copy.ghosts}];
    case 'conditionals':
      return [{text: copy.conditionals}];
    case 'review':
      return [{text: copy.review}];
    case 'submit':
      return [{text: copy.submit}];
    case 'title':
    case 'code':
    case 'cta':
      return [];
  }
};

const getRequiredSceneFrames = (scene: SceneName) =>
  getCaptionSpecs(scene).reduce(
    (total, spec) =>
      total + Math.max(spec.preferredFrames ?? 0, getCaptionMinimumFrames(spec.text)),
    0,
  );

/**
 * Extends a scene to fit every caption. Footage scenes are slowed instead of
 * repeating their last source frame; graphic scenes naturally hold longer.
 */
export const enforceCaptionMinimums = (
  timing: SceneTiming,
  playbackRateWhenExtended?: number,
): SceneTiming => {
  const requiredFrames = getRequiredSceneFrames(timing.name);
  if (requiredFrames === 0 || timing.duration >= requiredFrames) {
    return timing;
  }

  let duration = requiredFrames;
  if (
    playbackRateWhenExtended !== undefined &&
    timing.sourceStartFrame !== undefined &&
    timing.sourceEndFrame !== undefined
  ) {
    duration = Math.max(
      duration,
      Math.ceil((timing.sourceEndFrame - timing.sourceStartFrame) / playbackRateWhenExtended),
    );
  }

  const sourceFrames =
    timing.sourceStartFrame !== undefined && timing.sourceEndFrame !== undefined
      ? timing.sourceEndFrame - timing.sourceStartFrame
      : undefined;

  return {
    ...timing,
    duration,
    unadjustedDuration: timing.duration,
    playbackRate: sourceFrames === undefined ? timing.playbackRate : sourceFrames / duration,
  };
};

export const getCaptionDurations = (timing: SceneTiming): CaptionDuration[] => {
  const specs = getCaptionSpecs(timing.name);
  if (specs.length === 0) {
    return [];
  }

  const originalDuration = timing.unadjustedDuration ?? timing.duration;
  if (specs.length === 1) {
    const spec = specs[0];
    const requiredFrames = getCaptionMinimumFrames(spec.text);
    return [{
      scene: timing.name,
      text: spec.text,
      wordCount: countCaptionWords(spec.text),
      requiredSeconds: getCaptionMinimumSeconds(spec.text),
      requiredFrames,
      actualFrames: timing.duration,
      neededAdjustment: originalDuration < requiredFrames,
    }];
  }

  const originalHeadFrames = specs
    .slice(0, -1)
    .map((spec) => spec.preferredFrames ?? getCaptionMinimumFrames(spec.text));
  const actualHeadFrames = specs
    .slice(0, -1)
    .map((spec, index) =>
      Math.max(originalHeadFrames[index], getCaptionMinimumFrames(spec.text)),
    );
  const originalLastFrames = originalDuration -
    originalHeadFrames.reduce((total, frames) => total + frames, 0);
  const actualLastFrames = timing.duration -
    actualHeadFrames.reduce((total, frames) => total + frames, 0);

  return specs.map((spec, index) => {
    const requiredFrames = getCaptionMinimumFrames(spec.text);
    const isLast = index === specs.length - 1;
    return {
      scene: timing.name,
      text: spec.text,
      wordCount: countCaptionWords(spec.text),
      requiredSeconds: getCaptionMinimumSeconds(spec.text),
      requiredFrames,
      actualFrames: isLast ? actualLastFrames : actualHeadFrames[index],
      neededAdjustment: (isLast ? originalLastFrames : originalHeadFrames[index]) < requiredFrames,
    };
  });
};

const footageDuration = (
  timeline: Timeline,
  start: MarkName,
  end: MarkName,
  maxSeconds: number,
  playbackRate = 1,
  startOffsetMs = 0,
  endOffsetMs = 0,
) => {
  const sourceStartMs = timeline.marks[start] + startOffsetMs;
  const sourceEndMs = timeline.marks[end] + endOffsetMs;
  if (sourceStartMs < 0 || sourceEndMs > timeline.durationMs || sourceEndMs <= sourceStartMs) {
    throw new Error(`${start}..${end} offsets must stay ordered and within the recording`);
  }

  const sourceStartFrame = msToFrame(sourceStartMs);
  const markedEndFrame = msToFrame(sourceEndMs);
  const sourceFrames = Math.max(1, markedEndFrame - sourceStartFrame);
  const maxFrames = maxSeconds * OUTPUT_FPS;
  const effectiveRate = Math.max(playbackRate, sourceFrames / maxFrames);
  const duration = Math.max(1, Math.min(maxFrames, Math.ceil(sourceFrames / effectiveRate)));

  return {
    duration,
    sourceStartFrame,
    sourceEndFrame: markedEndFrame,
    playbackRate: effectiveRate,
  };
};

const TITLE_FRAMES = msToFrame(2600);
const CODE_FRAMES = msToFrame(5000);
const CTA_FRAMES = msToFrame(3500);
const PASTE_LEAD_MS = 900;
const FILL_LEAD_MS = 800;
const CONDITIONALS_REVEAL_LEAD_MS = 1500;
export const TITLE_CROSSFADE_FRAMES = msToFrame(600);

export const getScenePlan = (timeline: Timeline): SceneTiming[] => {
  const title = enforceCaptionMinimums({name: 'title', start: 0, duration: TITLE_FRAMES});
  const footage = [
    {
      name: 'paste' as const,
      start: 'paste' as const,
      startOffsetMs: -PASTE_LEAD_MS,
      end: 'fillStart' as const,
      max: 4,
    },
    {
      name: 'fill' as const,
      start: 'firstField' as const,
      startOffsetMs: -FILL_LEAD_MS,
      end: 'fillDone' as const,
      max: 12,
    },
    {name: 'evidence' as const, start: 'chipClick' as const, end: 'ghostFocus' as const, max: 5},
    {
      name: 'ghosts' as const,
      start: 'ghostFocus' as const,
      end: 'gateAnswer' as const,
      endOffsetMs: -CONDITIONALS_REVEAL_LEAD_MS,
      max: 5,
    },
    {
      name: 'conditionals' as const,
      start: 'gateAnswer' as const,
      startOffsetMs: -CONDITIONALS_REVEAL_LEAD_MS,
      end: 'gateAnswer' as const,
      max: 3,
      extendedRate: 0.6,
    },
    {
      name: 'review' as const,
      start: 'reviewStart' as const,
      end: 'humanAnswer' as const,
      max: 6,
      rate: 1.6,
    },
    {name: 'submit' as const, start: 'submitReady' as const, end: 'end' as const, max: 4.5},
  ];

  const plan: SceneTiming[] = [title];
  let cursor = title.duration - TITLE_CROSSFADE_FRAMES;
  for (const scene of footage) {
    const timing = footageDuration(
      timeline,
      scene.start,
      scene.end,
      scene.max,
      scene.rate ?? 1,
      scene.startOffsetMs ?? 0,
      scene.endOffsetMs ?? 0,
    );
    const captionSafeTiming = enforceCaptionMinimums(
      {name: scene.name, start: cursor, ...timing},
      scene.extendedRate,
    );
    plan.push(captionSafeTiming);
    cursor += captionSafeTiming.duration;
  }
  const code = enforceCaptionMinimums({name: 'code', start: cursor, duration: CODE_FRAMES});
  plan.push(code);
  cursor += code.duration;
  plan.push(enforceCaptionMinimums({name: 'cta', start: cursor, duration: CTA_FRAMES}));

  return plan;
};

export const getScene = (timeline: Timeline, name: SceneName) => {
  const scene = getScenePlan(timeline).find((item) => item.name === name);
  if (!scene) {
    throw new Error(`Unknown scene: ${name}`);
  }
  return scene;
};

export const getTotalFrames = (timeline: Timeline) => {
  const plan = getScenePlan(timeline);
  const finalScene = plan[plan.length - 1];
  return finalScene.start + finalScene.duration;
};

export const markInScene = (
  timeline: Timeline,
  timing: SceneTiming,
  mark: MarkName,
) => {
  if (timing.sourceStartFrame === undefined) {
    return 0;
  }
  const rate = timing.playbackRate ?? 1;
  return Math.max(0, Math.round((msToFrame(timeline.marks[mark]) - timing.sourceStartFrame) / rate));
};
