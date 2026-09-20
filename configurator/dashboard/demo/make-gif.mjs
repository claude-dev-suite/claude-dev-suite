// SPDX-License-Identifier: MIT
/**
 * Turn the captured frames into the README GIF (and an MP4 for X).
 *
 * GitHub renders a committed GIF inline but not a committed MP4 — a repo-relative
 * .mp4 in Markdown is shown as a link, not a player. So the README asset has to
 * be a GIF, and GitHub caps images at 10 MB. That ceiling, not aesthetics, is why
 * this scales down and drops frames.
 *
 * Two-pass palette: a single global palette generated from the whole clip, then
 * applied with dithering. A per-frame palette looks better in theory and banding
 * in practice on a dark UI with large flat panels.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAME_DIR = process.env.DEMO_FRAMES ?? path.join(__dirname, '.frames');
const OUT_DIR = process.env.DEMO_OUT ?? path.resolve(__dirname, '../../../docs/assets');

const META = JSON.parse(fs.readFileSync(path.join(FRAME_DIR, 'meta.json'), 'utf8'));

// Output width. 1440 native is far too wide for a 10 MB GIF, and GitHub renders
// README images around 900px anyway.
const WIDTH = Number(process.env.DEMO_WIDTH ?? 960);
const FPS = Number(process.env.DEMO_GIF_FPS ?? 12);

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

fs.mkdirSync(OUT_DIR, { recursive: true });

const input = path.join(FRAME_DIR, 'f%05d.png');
const palette = path.join(FRAME_DIR, 'palette.png');
const gif = path.join(OUT_DIR, 'demo-detection.gif');
const mp4 = path.join(OUT_DIR, 'demo-detection.mp4');

// Crop before scaling. The capture viewport runs to the bottom of the shell, so
// the last ~85px are the Back/Continue row and the Terminal/Logs bar — neither
// says anything, and half-cut chrome at the bottom edge reads as a mistake.
const CROP_H = Number(process.env.DEMO_CROP_H ?? 625);
const crop = `crop=${META.width}:${CROP_H}:0:0`;

const scale = `${crop},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`;

console.log(`source: ${META.frames} frames @ ${META.fps}fps, ${META.width}x${META.height}`);
console.log(`target: ${WIDTH}px wide @ ${FPS}fps`);

// Pass 1 — one palette for the whole clip.
ff(['-framerate', String(META.fps), '-i', input, '-vf', `${scale},palettegen=stats_mode=diff`, palette]);

// Pass 2 — apply it.
ff([
  '-framerate', String(META.fps), '-i', input,
  '-i', palette,
  '-lavfi', `${scale}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
  '-loop', '0',
  gif,
]);

// MP4 as well: X takes video directly, and it is a fraction of the size.
ff([
  '-framerate', String(META.fps), '-i', input,
  '-vf', `${crop},fps=${FPS},scale=${WIDTH}:-2:flags=lanczos`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart',
  mp4,
]);

const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(2);
console.log(`\n  ${path.relative(process.cwd(), gif)}  ${mb(gif)} MB`);
console.log(`  ${path.relative(process.cwd(), mp4)}  ${mb(mp4)} MB`);

if (fs.statSync(gif).size > 10 * 1048576) {
  console.error('\nGIF exceeds GitHub\'s 10 MB limit. Lower DEMO_WIDTH or DEMO_GIF_FPS.');
  process.exit(1);
}
