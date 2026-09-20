// SPDX-License-Identifier: MIT
/**
 * Record the README demo.
 *
 * Drives the wizard through detection and captures it as frames, then hands off
 * to make-gif.mjs. The point is that the footage is generated, not filmed: when
 * the dashboard changes, re-run this and the asset is current. A hand-recorded
 * demo of a catalog that grows every release is stale the week after it ships.
 *
 * Two things Playwright will not do for us:
 *   - It never renders a mouse pointer (microsoft/playwright#6629), so a video
 *     of clicks is unreadable. We draw our own and animate it between targets.
 *   - Its `video` option silently scales output to fit 800x800, so we capture
 *     discrete screenshots instead and let ffmpeg assemble them. That also makes
 *     the pacing exact rather than dependent on how fast the machine rendered.
 *
 * Usage:
 *   node demo/record-demo.mjs            # assumes a dashboard on PORT
 *   PORT=3901 node demo/record-demo.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ?? '3456';
const PROJECT = process.env.DEMO_PROJECT;
const FRAME_DIR = process.env.DEMO_FRAMES ?? path.join(__dirname, '.frames');
const FPS = 20;

if (!PROJECT) {
  console.error('DEMO_PROJECT must point at the fixture project directory.');
  process.exit(1);
}

// Viewport is cropped to the content: the wizard occupies the top ~710px and
// everything below it is empty shell, which would just be dead weight in a GIF
// that has a 10 MB ceiling on GitHub.
const VIEW = { width: 1440, height: 710 };

fs.rmSync(FRAME_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAME_DIR, { recursive: true });

let frameNo = 0;
const shot = async (page) => {
  await page.screenshot({
    path: path.join(FRAME_DIR, `f${String(frameNo++).padStart(5, '0')}.png`),
    animations: 'allow',
  });
};

/** Hold the current state for `ms`, emitting frames so the GIF keeps timing. */
const hold = async (page, ms) => {
  const frames = Math.round((ms / 1000) * FPS);
  for (let i = 0; i < frames; i++) {
    await shot(page);
    await page.waitForTimeout(1000 / FPS);
  }
};

// ---------------------------------------------------------------------------
// Cursor overlay
// ---------------------------------------------------------------------------

const CURSOR_CSS = `
#__demo_cursor {
  position: fixed; top: 0; left: 0; width: 22px; height: 22px;
  margin: -2px 0 0 -2px; z-index: 2147483647; pointer-events: none;
  transition: none;
}
#__demo_cursor svg { display:block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
#__demo_ring {
  position: fixed; z-index: 2147483646; pointer-events: none;
  width: 0; height: 0; border-radius: 50%;
  border: 2px solid rgba(96,165,250,.9); opacity: 0;
}
`;

async function installCursor(page) {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.evaluate(() => {
    // Idempotent: re-installing after a client-side navigation otherwise leaves
    // the previous cursor parked at 0,0, and a second arrow in the corner of
    // every frame is the kind of thing nobody notices until it is published.
    document.getElementById('__demo_cursor')?.remove();
    document.getElementById('__demo_ring')?.remove();
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    // Built with DOM calls rather than innerHTML. The markup is a constant with
    // nothing interpolated, but this file lives in a repo whose security tests
    // police exactly this pattern, and an exception is not worth explaining.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M5 2l14 8.5-6.2 1.2 3.3 6.6-2.7 1.3-3.3-6.6L5 18z');
    p.setAttribute('fill', '#fff');
    p.setAttribute('stroke', '#111');
    p.setAttribute('stroke-width', '1.2');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    c.appendChild(svg);
    document.body.appendChild(c);
    const r = document.createElement('div');
    r.id = '__demo_ring';
    document.body.appendChild(r);
    window.__demoMove = (x, y) => {
      const el = document.getElementById('__demo_cursor');
      if (el) el.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.__demoRing = (x, y) => {
      const el = document.getElementById('__demo_ring');
      if (!el) return;
      el.style.transition = 'none';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = '0px';
      el.style.height = '0px';
      el.style.margin = '0';
      el.style.opacity = '0.9';
      requestAnimationFrame(() => {
        el.style.transition = 'width .35s ease-out, height .35s ease-out, margin .35s ease-out, opacity .35s ease-out';
        el.style.width = '46px';
        el.style.height = '46px';
        el.style.margin = '-23px 0 0 -23px';
        el.style.opacity = '0';
      });
    };
  });
}

let cursor = { x: 40, y: 40 };

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Glide the drawn cursor to a point, emitting a frame per step. */
async function moveTo(page, x, y, ms = 700) {
  const steps = Math.max(2, Math.round((ms / 1000) * FPS));
  const from = { ...cursor };
  for (let i = 1; i <= steps; i++) {
    const t = easeInOut(i / steps);
    const cx = from.x + (x - from.x) * t;
    const cy = from.y + (y - from.y) * t;
    await page.evaluate(([a, b]) => window.__demoMove(a, b), [cx, cy]);
    await page.mouse.move(cx, cy);
    await shot(page);
    await page.waitForTimeout(1000 / FPS);
  }
  cursor = { x, y };
}

async function centerOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clickAt(page, locator, { ms = 700 } = {}) {
  const { x, y } = await centerOf(locator);
  await moveTo(page, x, y, ms);
  await page.evaluate(([a, b]) => window.__demoRing(a, b), [x, y]);
  await hold(page, 250);
  await locator.click();
}

/**
 * Put the path into the field in one shot, then hold so it reads.
 *
 * Deliberately `fill()` and not character-by-character typing. Step1Detection's
 * auto-detect effect runs on every change to `projectPath`, so typing a Windows
 * path fires a detection request per keystroke — and the partial value `C:\` is
 * absolute enough to return 200 with `project_type: "unknown"`, which makes
 * `detection` truthy and latches "Unknown / Not detected / 0% confidence" onto
 * the panel for the rest of the typing.
 *
 * Clicking Detect afterwards does recover it, so this is a transient defect
 * rather than a dead end. But filming it would mean shipping a README loop that
 * spends two seconds telling the viewer dev-suite cannot read their project.
 * `fill()` is one change, so one request, with the right answer.
 */
async function setPath(page, locator, text) {
  await clickAt(page, locator, { ms: 650 });
  await hold(page, 200);
  await locator.fill(text);
  await shot(page);
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await installCursor(page);

// Re-install the overlay after any client-side navigation that wipes it.
page.on('framenavigated', () => installCursor(page).catch(() => {}));

// ── Beat 1: the welcome screen, then into "configure existing" ────────────
await hold(page, 700);
const configureCard = page.locator('button:has-text("Configure Existing Project")').first();
await clickAt(page, configureCard, { ms: 800 });
await page.waitForTimeout(900);
await installCursor(page);
await page.evaluate(([a, b]) => window.__demoMove(a, b), [cursor.x, cursor.y]);
await hold(page, 500);

// ── Beat 2: the project path ──────────────────────────────────────────────
const pathInput = page.locator('input[placeholder*="project path" i]').first();
await pathInput.waitFor({ state: 'visible', timeout: 15_000 });
await setPath(page, pathInput, PROJECT);
await hold(page, 700);

// ── Beat 3: detect ────────────────────────────────────────────────────────
// `getByRole` with an exact name, not `has-text("Detect")`: that also matches
// the sidebar's "1 Detection — Analyze project" step button, and `.first()`
// then clicks the navigation instead of the action.
const detectBtn = page.getByRole('button', { name: 'Detect', exact: true });
await clickAt(page, detectBtn, { ms: 600 });

// Capture the result arriving rather than cutting to it.
const results = page.locator('text=Detection Results').first();
await results.waitFor({ state: 'visible', timeout: 30_000 });
await hold(page, 400);

// ── Beat 4: hold on the result — this is the frame that does the work ─────
await hold(page, 2600);

// Fail loudly rather than shipping a GIF of a failed detection. The results
// panel renders either way: an empty one says "Unknown" at 0% confidence, and
// that is indistinguishable from success until someone looks at the asset.
const resultText = await page.evaluate(() => document.body.innerText);
const bad = [];
if (resultText.includes('Unknown')) bad.push('project type "Unknown"');
if (resultText.includes('Not detected')) bad.push('"Not detected"');
// `\b0%` and not `includes('0%')` — "100%" contains "0%", so the naive check
// rejected every successful run.
if (/(^|[^0-9])0%/.test(resultText)) bad.push('0% confidence');
if (bad.length) {
  await page.screenshot({ path: path.join(FRAME_DIR, 'FAILED.png') });
  await browser.close();
  console.error(
    `Detection did not succeed — the results panel still shows: ${bad.join(', ')}.\n` +
      `See ${path.join(FRAME_DIR, 'FAILED.png')}. Not writing a demo of a broken run.`
  );
  process.exit(1);
}

await browser.close();

fs.writeFileSync(
  path.join(FRAME_DIR, 'meta.json'),
  JSON.stringify({ fps: FPS, frames: frameNo, width: VIEW.width, height: VIEW.height }, null, 2)
);

console.log(`captured ${frameNo} frames at ${FPS}fps → ${FRAME_DIR}`);
