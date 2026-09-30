import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {copy} from '../src/copy';
import {
  getCaptionDurations,
  getScene,
  getScenePlan,
  OUTPUT_FPS,
  validateTimeline,
} from '../src/timeline';

const main = async () => {
  const timelinePath = fileURLToPath(new URL('../../assets/demo.timeline.json', import.meta.url));
  const timeline = validateTimeline(JSON.parse(await readFile(timelinePath, 'utf8')));
  const rows = getScenePlan(timeline).flatMap(getCaptionDurations);

  for (const row of rows) {
    assert.ok(
      row.actualFrames >= row.requiredFrames,
      `${row.scene} caption has ${row.actualFrames} frames; needs ${row.requiredFrames}`,
    );
  }

  const conditionals = getScene(timeline, 'conditionals');
  assert.equal(copy.conditionals, 'The section opens — already filled.');
  assert.equal(conditionals.playbackRate, 0.6, 'Conditionals footage must play at 0.6x');

  console.table(
    rows.map((row) => ({
      scene: row.scene,
      words: row.wordCount,
      required: `${row.requiredSeconds.toFixed(2)}s`,
      actual: `${(row.actualFrames / OUTPUT_FPS).toFixed(3)}s`,
      adjusted: row.neededAdjustment ? 'yes' : 'no',
    })),
  );
  console.log(`PASS: all ${rows.length} captions meet max(1.6s, words * 0.32s).`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
