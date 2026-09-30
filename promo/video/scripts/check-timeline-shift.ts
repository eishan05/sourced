import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {getSceneFraming} from '../src/framing';
import {
  getScene,
  getScenePlan,
  getTotalFrames,
  markInScene,
  msToFrame,
  OUTPUT_FPS,
  validateTimeline,
} from '../src/timeline';

const main = async () => {
const timelinePath = fileURLToPath(new URL('../../assets/demo.timeline.json', import.meta.url));
const rawTimeline = JSON.parse(await readFile(timelinePath, 'utf8'));
const timeline = validateTimeline(rawTimeline);
const shiftMs = 1000;
const shiftedInput = structuredClone(rawTimeline);

shiftedInput.durationMs += shiftMs;
for (const mark of Object.keys(shiftedInput.marks)) {
  shiftedInput.marks[mark] += shiftMs;
}

const shifted = validateTimeline(shiftedInput);
const originalPlan = getScenePlan(timeline);
const shiftedPlan = getScenePlan(shifted);
const sourceFrameShift = msToFrame(shiftMs);

assert.equal(originalPlan.length, shiftedPlan.length);
for (let index = 0; index < originalPlan.length; index += 1) {
  const original = originalPlan[index];
  const moved = shiftedPlan[index];
  assert.equal(moved.name, original.name);
  assert.equal(moved.start, original.start, `${original.name} render start changed`);
  assert.equal(moved.duration, original.duration, `${original.name} render duration changed`);
  if (original.sourceStartFrame !== undefined && moved.sourceStartFrame !== undefined) {
    assert.equal(moved.sourceStartFrame - original.sourceStartFrame, sourceFrameShift);
  }
  if (original.sourceEndFrame !== undefined && moved.sourceEndFrame !== undefined) {
    assert.equal(moved.sourceEndFrame - original.sourceEndFrame, sourceFrameShift);
  }

  const originalFraming = getSceneFraming(timeline, original);
  const shiftedFraming = getSceneFraming(shifted, moved);
  assert.deepEqual(shiftedFraming, originalFraming, `${original.name} framing drifted`);
}

const paste = getScene(timeline, 'paste');
const fill = getScene(timeline, 'fill');
assert.equal(
  paste.sourceStartFrame,
  msToFrame(timeline.marks.paste - 900),
  'Paste must begin 900ms before the paste mark',
);
assert.equal(
  fill.sourceStartFrame,
  msToFrame(timeline.marks.firstField - 800),
  'Fill must begin 800ms before the first field mark',
);
assert.equal(fill.playbackRate, 1, 'Fill must remain at 1x');
const firstFieldFrame = fill.start + markInScene(timeline, fill, 'firstField');
assert.ok(firstFieldFrame < 5 * OUTPUT_FPS, 'First streamed field must land before 5s');
const totalFrames = getTotalFrames(timeline);
assert.ok(totalFrames >= 38 * OUTPUT_FPS, 'Promo must be at least 38s');
assert.ok(totalFrames <= 42 * OUTPUT_FPS, 'Promo must be at most 42s');

console.log(
  `PASS: shifting every source mark by ${shiftMs}ms moved all footage trims by ` +
    `${sourceFrameShift} source frames while render timings and timeline-derived framings stayed stable; ` +
    `first field lands at ${(firstFieldFrame / OUTPUT_FPS).toFixed(3)}s and total duration is ` +
    `${(totalFrames / OUTPUT_FPS).toFixed(3)}s.`,
);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
