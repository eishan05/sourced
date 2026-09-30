import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  captionLayout,
  getCameraAtFrame,
  getCaptionPlacement,
  getSceneFraming,
  projectRegion,
  rectanglesIntersect,
  screenBody,
  screenPosition,
} from '../src/framing';
import {getScene, getScenePlan, OUTPUT_FPS, validateTimeline} from '../src/timeline';

const main = async () => {
const timelinePath = fileURLToPath(new URL('../../assets/demo.timeline.json', import.meta.url));
const timeline = validateTimeline(JSON.parse(await readFile(timelinePath, 'utf8')));
const epsilon = 1e-7;
let checkedCameraFrames = 0;
let checkedCaptionFrames = 0;

const number = (value: number) => value.toFixed(2);

console.log(
  `Frame body: ${number(screenBody.width)}x${number(screenBody.height)}; source: ${timeline.width}x${timeline.height}`,
);

for (const timing of getScenePlan(timeline)) {
  const framing = getSceneFraming(timeline, timing);
  if (!framing) {
    console.log(`${timing.name}: graphic scene (no footage framing)`);
    continue;
  }

  let minimumScale = Number.POSITIVE_INFINITY;
  let maximumScale = Number.NEGATIVE_INFINITY;
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  const anchors = {'top-left': 0, 'bottom-left': 0};
  let fallbackFrames = 0;

  for (let frame = 0; frame < timing.duration; frame += 1) {
    const camera = getCameraAtFrame(timeline, framing, frame);
    const scaledWidth = screenBody.width * camera.scale;
    const scaledHeight = screenBody.height * camera.scale;

    assert.ok(scaledWidth + epsilon >= screenBody.width, `${timing.name}:${frame} width`);
    assert.ok(scaledHeight + epsilon >= screenBody.height, `${timing.name}:${frame} height`);
    assert.ok(
      camera.x + epsilon >= -(scaledWidth - screenBody.width) && camera.x <= epsilon,
      `${timing.name}:${frame} x=${camera.x}`,
    );
    assert.ok(
      camera.y + epsilon >= -(scaledHeight - screenBody.height) && camera.y <= epsilon,
      `${timing.name}:${frame} y=${camera.y}`,
    );
    checkedCameraFrames += 1;

    minimumScale = Math.min(minimumScale, camera.scale);
    maximumScale = Math.max(maximumScale, camera.scale);
    minimumX = Math.min(minimumX, camera.x);
    maximumX = Math.max(maximumX, camera.x);
    minimumY = Math.min(minimumY, camera.y);
    maximumY = Math.max(maximumY, camera.y);

    const placement = getCaptionPlacement({timeline, framing, frame});
    assert.ok(placement.clean, `${timing.name}:${frame} has no clean caption anchor`);
    if (placement.target) {
      assert.ok(
        !rectanglesIntersect(placement.rect, placement.target),
        `${timing.name}:${frame} caption intersects ${placement.regionName}`,
      );
    }
    anchors[placement.anchor] += 1;
    fallbackFrames += placement.width === captionLayout.fallbackWidth ? 1 : 0;
    checkedCaptionFrames += 1;
  }

  const sampleFrames = [0, Math.floor((timing.duration - 1) / 2), timing.duration - 1];
  const samples = sampleFrames.map((frame) => {
    const camera = getCameraAtFrame(timeline, framing, frame);
    return `${frame}:s${number(camera.scale)},x${number(camera.x)},y${number(camera.y)}`;
  });
  console.log(
    `${timing.name}: ${timing.duration}f scale ${number(minimumScale)}..${number(maximumScale)}, ` +
      `x ${number(minimumX)}..${number(maximumX)}, y ${number(minimumY)}..${number(maximumY)}; ` +
      `start/mid/end [${samples.join(' | ')}]; captions top=${anchors['top-left']} ` +
      `bottom=${anchors['bottom-left']} fallback900=${fallbackFrames} collisions=0`,
  );
}

const evidence = getScene(timeline, 'evidence');
const evidenceFraming = getSceneFraming(timeline, evidence);
assert.ok(evidenceFraming, 'Evidence framing is missing');
const evidenceTransitionEnd =
  evidenceFraming.transitionStart + evidenceFraming.transitionDuration;
const evidenceHold = evidence.duration - evidenceTransitionEnd;
assert.ok(
  evidenceHold >= Math.round(1.2 * OUTPUT_FPS),
  `Evidence hold is only ${evidenceHold} frames`,
);
const settledCamera = getCameraAtFrame(timeline, evidenceFraming, evidenceTransitionEnd);
const highlight = projectRegion(timeline, 'sourceHighlight', settledCamera);
const bodyRect = {
  x: screenPosition.left,
  y: screenPosition.bodyTop,
  w: screenBody.width,
  h: screenBody.height,
};
assert.ok(highlight.x >= bodyRect.x - epsilon, 'sourceHighlight escapes left');
assert.ok(highlight.y >= bodyRect.y - epsilon, 'sourceHighlight escapes top');
assert.ok(highlight.x + highlight.w <= bodyRect.x + bodyRect.w + epsilon, 'sourceHighlight escapes right');
assert.ok(highlight.y + highlight.h <= bodyRect.y + bodyRect.h + epsilon, 'sourceHighlight escapes bottom');

console.log(
  `Evidence rest hold: ${evidenceHold}f / ${number(evidenceHold / OUTPUT_FPS)}s; ` +
    `sourceHighlight projected x=${number(highlight.x)}..${number(highlight.x + highlight.w)}, ` +
    `y=${number(highlight.y)}..${number(highlight.y + highlight.h)} inside body ` +
    `x=${number(bodyRect.x)}..${number(bodyRect.x + bodyRect.w)}, ` +
    `y=${number(bodyRect.y)}..${number(bodyRect.y + bodyRect.h)}`,
);
const fill = getScene(timeline, 'fill');
assert.equal(fill.playbackRate, 1, 'Fill must play at 1x');
console.log(
  `Fill payoff: ${fill.duration}f / ${number(fill.duration / OUTPUT_FPS)}s at ` +
    `${number(fill.playbackRate)}x.`,
);
console.log(
  `PASS: ${checkedCameraFrames} camera frames satisfy all four coverage inequalities; ` +
    `${checkedCaptionFrames} caption frames have zero target intersections.`,
);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
