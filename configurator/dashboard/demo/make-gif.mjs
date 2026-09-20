// SPDX-License-Identifier: MIT
/**
 * Encode one scene's frames into the README GIF and an MP4.
 *
 *   node demo/make-gif.mjs <scene>
 *
 * GitHub renders a committed GIF inline but not a committed MP4 — a repo-relative
 * .mp4 in Markdown is shown as a link, not a player. So the README asset has to be
 * a GIF, and GitHub caps images at 10 MB. That ceiling, not aesthetics, is why this
 * crops and scales.
 *
 * Two-pass palette: one global palette for the whole clip, then applied with
 * dithering. A per-frame palette looks better in theory and bands in practice on a
 * dark UI with large flat panels.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenes } from './scenes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const name = process.argv[2] ?? 'detection';
const scene = scenes[name];
if (!scene) {
  console.error(`unknown scene "${name}". Known: ${Object.keys(scenes).join(', ')}`);
  process.exit(1);
}

const FRAME_DIR = process.env.DEMO_FRAMES ?? path.join(__dirname, '.frames', name);
const OUT_DIR = process.env.DEMO_OUT ?? path.resolve(__dirname, '../../../docs/assets');
const META = JSON.parse(fs.readFileSync(path.join(FRAME_DIR, 'meta.json'), 'utf8'));

// 1440 native is far too wide for a GIF, and GitHub renders README images around
// 900px anyway.
const WIDTH = Number(process.env.DEMO_WIDTH ?? 1280);
const FPS = Number(process.env.DEMO_GIF_FPS ?? META.fps);

// Crop before scaling. The capture viewport runs to the bottom of the shell, so the
// last stretch is the Back/Continue row and the Terminal/Logs bar — neither says
// anything, and half-cut chrome at the bottom edge reads as a mistake.
const CROP_H = Number(process.env.DEMO_CROP_H ?? scene.cropHeight ?? META.height);

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

fs.mkdirSync(OUT_DIR, { recursive: true });

const input = path.join(FRAME_DIR, 'f%05d.png');
const palette = path.join(FRAME_DIR, 'palette.png');
const gif = path.join(OUT_DIR, `${scene.out}.gif`);
const mp4 = path.join(OUT_DIR, `${scene.out}.mp4`);

const chain = `crop=${META.width}:${CROP_H}:0:0,fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`;

console.log(`  ${name}: ${META.frames} frames @ ${META.fps}fps, ${META.width}x${META.height} → ${WIDTH}px, crop ${CROP_H}`);

ff(['-framerate', String(META.fps), '-i', input, '-vf', `${chain},palettegen=stats_mode=diff`, palette]);
ff([
  '-framerate', String(META.fps), '-i', input,
  '-i', palette,
  '-lavfi', `${chain}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
  '-loop', '0',
  gif,
]);
ff([
  '-framerate', String(META.fps), '-i', input,
  '-vf', `crop=${META.width}:${CROP_H}:0:0,fps=${FPS},scale=${WIDTH}:-2:flags=lanczos`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
  mp4,
]);

const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(2);
console.log(`  ${path.basename(gif)}  ${mb(gif)} MB      ${path.basename(mp4)}  ${mb(mp4)} MB`);

if (fs.statSync(gif).size > 10 * 1048576) {
  console.error(`\n${path.basename(gif)} exceeds GitHub's 10 MB limit. Lower DEMO_WIDTH or DEMO_GIF_FPS.`);
  process.exit(1);
}
