import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const videoOnlyPath = fileURLToPath(
  new URL('../../out/sourced-promo-video-only.mp4', import.meta.url),
);
const finalPath = fileURLToPath(new URL('../../out/sourced-promo-1080p.mp4', import.meta.url));

const videoHash = (path) =>
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-map', '0:v:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'],
    {encoding: 'utf8'},
  ).trim();

const originalVideoHash = videoHash(videoOnlyPath);

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoOnlyPath,
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    '-movflags',
    '+faststart',
    finalPath,
  ],
  {stdio: 'inherit'},
);

const muxedVideoHash = videoHash(finalPath);
assert.equal(muxedVideoHash, originalVideoHash, 'Muxing changed the encoded video packets');

const probe = JSON.parse(
  execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels',
      '-of',
      'json',
      finalPath,
    ],
    {encoding: 'utf8'},
  ),
);
const videoStreams = probe.streams.filter((stream) => stream.codec_type === 'video');
const audioStreams = probe.streams.filter((stream) => stream.codec_type === 'audio');
assert.equal(videoStreams.length, 1, 'Final file must contain exactly one video stream');
assert.equal(audioStreams.length, 1, 'Final file must contain exactly one audio stream');
assert.equal(videoStreams[0].codec_name, 'h264');
assert.equal(videoStreams[0].width, 1920);
assert.equal(videoStreams[0].height, 1080);
assert.equal(videoStreams[0].r_frame_rate, '30/1');
assert.equal(audioStreams[0].codec_name, 'aac');
assert.equal(audioStreams[0].sample_rate, '48000');
assert.equal(audioStreams[0].channels, 2);

await unlink(videoOnlyPath);
console.log(`Muxed silent 48 kHz stereo AAC; copied video hash ${muxedVideoHash}`);

