// SPDX-License-Identifier: MIT
/**
 * Shared recording machinery for the demo scenes.
 *
 * Two things Playwright will not do, which everything here exists to work around:
 *   - It never renders a mouse pointer (microsoft/playwright#6629), so a video of
 *     clicks is unreadable. We draw one and animate it between targets.
 *   - Its `video` option silently scales output to fit 800x800, and the pacing
 *     then depends on how fast the machine rendered. We capture discrete frames
 *     instead, so timing is exact and resolution is whatever the viewport is.
 */
import fs from 'node:fs';
import path from 'node:path';

export const FPS = 20;

const CURSOR_CSS = `
#__demo_cursor {
  position: fixed; top: 0; left: 0; width: 22px; height: 22px;
  margin: -2px 0 0 -2px; z-index: 2147483647; pointer-events: none; transition: none;
}
#__demo_cursor svg { display:block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
#__demo_ring {
  position: fixed; z-index: 2147483646; pointer-events: none;
  width: 0; height: 0; border-radius: 50%;
  border: 2px solid rgba(96,165,250,.9); opacity: 0;
}
`;

export class Recorder {
  constructor(page, frameDir) {
    this.page = page;
    this.frameDir = frameDir;
    this.n = 0;
    this.cursor = { x: 40, y: 40 };
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
  }

  async shot() {
    await this.page.screenshot({
      path: path.join(this.frameDir, `f${String(this.n++).padStart(5, '0')}.png`),
      animations: 'allow',
    });
  }

  /** Hold the current state, emitting frames so the clip keeps real timing. */
  async hold(ms) {
    const frames = Math.round((ms / 1000) * FPS);
    for (let i = 0; i < frames; i++) {
      await this.shot();
      await this.page.waitForTimeout(1000 / FPS);
    }
  }

  async installCursor() {
    await this.page.addStyleTag({ content: CURSOR_CSS });
    await this.page.evaluate(() => {
      // Idempotent: re-installing after a client-side navigation otherwise leaves
      // the previous cursor parked at 0,0, and a second arrow in the corner of
      // every frame is the kind of thing nobody notices until it is published.
      document.getElementById('__demo_cursor')?.remove();
      document.getElementById('__demo_ring')?.remove();

      const c = document.createElement('div');
      c.id = '__demo_cursor';
      // DOM calls rather than innerHTML: the markup is constant with nothing
      // interpolated, but this repo's security tests police the pattern and an
      // exception is not worth explaining.
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
        Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: '0px', height: '0px', margin: '0', opacity: '0.9' });
        requestAnimationFrame(() => {
          el.style.transition = 'width .35s ease-out, height .35s ease-out, margin .35s ease-out, opacity .35s ease-out';
          Object.assign(el.style, { width: '46px', height: '46px', margin: '-23px 0 0 -23px', opacity: '0' });
        });
      };
    });
    // Put the drawn cursor back where it logically is, or it jumps to 0,0.
    await this.page.evaluate(([a, b]) => window.__demoMove(a, b), [this.cursor.x, this.cursor.y]);
  }

  async moveTo(x, y, ms = 700) {
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const steps = Math.max(2, Math.round((ms / 1000) * FPS));
    const from = { ...this.cursor };
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      const cx = from.x + (x - from.x) * t;
      const cy = from.y + (y - from.y) * t;
      await this.page.evaluate(([a, b]) => window.__demoMove(a, b), [cx, cy]);
      await this.page.mouse.move(cx, cy);
      await this.shot();
      await this.page.waitForTimeout(1000 / FPS);
    }
    this.cursor = { x, y };
  }

  async clickAt(locator, { ms = 700, settle = 250 } = {}) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('element has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.moveTo(x, y, ms);
    await this.page.evaluate(([a, b]) => window.__demoRing(a, b), [x, y]);
    await this.hold(settle);
    await locator.click();
  }

  writeMeta(view) {
    fs.writeFileSync(
      path.join(this.frameDir, 'meta.json'),
      JSON.stringify({ fps: FPS, frames: this.n, width: view.width, height: view.height }, null, 2)
    );
  }
}

/**
 * Refuse to encode a clip of a failed run.
 *
 * Check `0%` with a boundary, not `includes('0%')` — "100%" contains "0%", and
 * the naive version rejected every success.
 */
export async function assertNoFailureText(page, frameDir, extraNeedles = []) {
  const text = await page.evaluate(() => document.body.innerText);
  const bad = [];
  if (text.includes('Unknown')) bad.push('"Unknown"');
  if (text.includes('Not detected')) bad.push('"Not detected"');
  if (/(^|[^0-9])0%/.test(text)) bad.push('0%');
  for (const n of extraNeedles) if (text.includes(n)) bad.push(JSON.stringify(n));
  if (bad.length) {
    await page.screenshot({ path: path.join(frameDir, 'FAILED.png') });
    throw new Error(
      `the page still shows ${bad.join(', ')} — see ${path.join(frameDir, 'FAILED.png')}. ` +
        'Not encoding a demo of a broken run.'
    );
  }
}
