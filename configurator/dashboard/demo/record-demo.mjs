// SPDX-License-Identifier: MIT
/**
 * Record one demo scene to frames.
 *
 *   PORT=… DEMO_PROJECT=… node demo/record-demo.mjs <scene>
 *
 * Scenes are defined in scenes.mjs; the machinery is in recorder.mjs. Normally
 * driven by make-demo.mjs rather than run directly.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Recorder } from './recorder.mjs';
import { scenes } from './scenes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const name = process.argv[2] ?? 'detection';
const scene = scenes[name];
if (!scene) {
  console.error(`unknown scene "${name}". Known: ${Object.keys(scenes).join(', ')}`);
  process.exit(1);
}

const PORT = process.env.PORT ?? '3456';
const project = process.env.DEMO_PROJECT;
if (!project) {
  console.error('DEMO_PROJECT must point at the fixture project directory.');
  process.exit(1);
}

const frameDir = process.env.DEMO_FRAMES ?? path.join(__dirname, '.frames', name);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: scene.view, deviceScaleFactor: 1 });
const page = await ctx.newPage();

let code = 0;
try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const rec = new Recorder(page, frameDir);
  await scene.run(page, rec, { project });
  rec.writeMeta(scene.view);

  console.log(`captured ${rec.n} frames → ${frameDir}`);
} catch (err) {
  console.error(`\n${err.message}`);
  code = 1;
} finally {
  await browser.close();
}

process.exit(code);
