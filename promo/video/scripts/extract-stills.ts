import {spawnSync} from 'node:child_process';
import {mkdir, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {getSceneFraming} from '../src/framing';
import {
  getScene,
  getScenePlan,
  markInScene,
  OUTPUT_FPS,
  SceneName,
  validateTimeline,
} from '../src/timeline';
import {readFile} from 'node:fs/promises';

const main = async () => {
const timelinePath = fileURLToPath(new URL('../../assets/demo.timeline.json', import.meta.url));
const videoPath = fileURLToPath(new URL('../../out/sourced-promo-1080p.mp4', import.meta.url));
const stillsDir = fileURLToPath(new URL('../../out/stills/', import.meta.url));
const timeline = validateTimeline(JSON.parse(await readFile(timelinePath, 'utf8')));

await mkdir(stillsDir, {recursive: true});
for (const filename of await readdir(stillsDir)) {
  if (
    /^real-.*\.png$/.test(filename) ||
    filename === 'contact.png' ||
    filename === 'filmstrip.png' ||
    /^review-.*\.png$/.test(filename)
  ) {
    await rm(path.join(stillsDir, filename));
  }
}

const evidence = getScene(timeline, 'evidence');
const evidenceFraming = getSceneFraming(timeline, evidence);
if (!evidenceFraming) {
  throw new Error('Evidence framing is missing');
}
const evidenceBefore = Math.max(0, evidenceFraming.transitionStart - 1);
const evidenceAfter = Math.min(
  evidence.duration - 1,
  evidenceFraming.transitionStart + evidenceFraming.transitionDuration,
);
const ghosts = getScene(timeline, 'ghosts');
const ghostAccept = markInScene(timeline, ghosts, 'ghostAccept');
const ghostCard = Math.min(ghosts.duration - 1, Math.max(0, Math.floor(ghostAccept / 2)));

const specialFrames: Partial<Record<SceneName, number>> = {
  fill: Math.max(
    0,
    getScene(timeline, 'fill').duration - Math.round(timeline.fps * (4 / 15)) - 1,
  ),
  evidence: evidenceAfter,
  ghosts: ghostCard,
  submit: Math.min(
    getScene(timeline, 'submit').duration - 1,
    markInScene(timeline, getScene(timeline, 'submit'), 'submitted'),
  ),
};

const stills = getScenePlan(timeline).map((scene, index) => ({
  name: `${String(index + 1).padStart(2, '0')}-${scene.name}.png`,
  frame: scene.start + (specialFrames[scene.name] ?? Math.floor(scene.duration / 2)),
}));
stills.push(
  {name: 'check-evidence-a.png', frame: evidence.start + evidenceBefore},
  {name: 'check-evidence-b.png', frame: evidence.start + evidenceAfter},
  {name: 'check-ghost-card.png', frame: ghosts.start + ghostCard},
);

for (const still of stills) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      (still.frame / OUTPUT_FPS).toFixed(6),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      path.join(stillsDir, still.name),
    ],
    {stdio: 'inherit'},
  );
  if (result.status !== 0) {
    throw new Error(`Could not extract ${still.name}`);
  }
  console.log(`${still.name}: frame ${still.frame} (${(still.frame / OUTPUT_FPS).toFixed(3)}s)`);
}

const filmstrip = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vf',
    'fps=1/1.2,scale=480:270,tile=6x6',
    '-frames:v',
    '1',
    path.join(stillsDir, 'filmstrip.png'),
  ],
  {stdio: 'inherit'},
);
if (filmstrip.status !== 0) {
  throw new Error('Could not extract filmstrip.png');
}
console.log('filmstrip.png: 1.2s cadence, 6x6 tiles');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
