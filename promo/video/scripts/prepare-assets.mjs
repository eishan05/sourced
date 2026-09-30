import {copyFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.resolve(projectDir, '../assets');
const publicDir = path.join(projectDir, 'public');
const outputDir = path.resolve(projectDir, '../out');

await Promise.all([
  mkdir(publicDir, {recursive: true}),
  mkdir(outputDir, {recursive: true}),
]);

await Promise.all([
  copyFile(path.join(sourceDir, 'demo.mp4'), path.join(publicDir, 'demo.mp4')),
  copyFile(
    path.join(sourceDir, 'demo.timeline.json'),
    path.join(publicDir, 'demo.timeline.json'),
  ),
]);

console.log('Prepared demo.mp4 and demo.timeline.json');
