// SPDX-License-Identifier: MIT
/**
 * The demo scenes. Each returns the viewport it wants and the beats to record.
 *
 * Shared navigation helpers live here too, because getting to a wizard step is
 * setup, not content — it happens before recording starts.
 */
import { Recorder, assertNoFailureText } from './recorder.mjs';

/** Selector for the path field — the only text input on the detection step. */
const PATH_INPUT = 'input[placeholder*="project path" i]';

/**
 * `getByRole` with an exact name, never `has-text("Detect")`: the latter also
 * matches the sidebar's "1 Detection — Analyze project" step button, and
 * `.first()` then clicks the navigation instead of the action.
 */
const exactButton = (page, name) => page.getByRole('button', { name, exact: true });

/**
 * Put the project path in and wait for a result — off camera.
 *
 * `fill()` and not typing: Step1Detection's auto-detect effect fires on every
 * change to `projectPath`, so character-by-character sends one request per
 * keystroke, and the partial value `C:\` is absolute enough to return 200 with
 * `project_type: "unknown"`. That latches "Unknown / 0% confidence" onto the
 * panel for the rest of the typing.
 */
async function detect(page, project) {
  await page.locator('button:has-text("Configure Existing Project")').first().click();
  await page.waitForTimeout(1200);
  await page.locator(PATH_INPUT).first().fill(project);
  await page.locator('text=Detection Results').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1200);
}

/** Advance `n` wizard steps with Continue. */
async function advance(page, n) {
  const cont = exactButton(page, 'Continue');
  for (let i = 0; i < n; i++) {
    await cont.click();
    await page.waitForTimeout(1500);
  }
}

// ---------------------------------------------------------------------------

export const scenes = {
  /** The README hero: a monorepo it has never seen, read from its manifests. */
  detection: {
    view: { width: 1440, height: 710 },
    cropHeight: 625,
    out: 'demo-detection',
    async run(page, rec, { project }) {
      await rec.installCursor();
      await rec.hold(700);

      const card = page.locator('button:has-text("Configure Existing Project")').first();
      await rec.clickAt(card, { ms: 800 });
      await page.waitForTimeout(900);
      await rec.installCursor();
      await rec.hold(500);

      const input = page.locator(PATH_INPUT).first();
      await input.waitFor({ state: 'visible', timeout: 15_000 });
      await rec.clickAt(input, { ms: 650 });
      await rec.hold(200);
      await input.fill(project);
      await rec.shot();
      await rec.hold(700);

      await rec.clickAt(exactButton(page, 'Detect'), { ms: 600 });
      await page.locator('text=Detection Results').first().waitFor({ state: 'visible', timeout: 30_000 });
      await rec.hold(3000);

      await assertNoFailureText(page, rec.frameDir);
    },
  },

  /**
   * The claim nobody else in the category makes: one catalog, several
   * assistants, each written in its own native format.
   */
  assistants: {
    view: { width: 1440, height: 760 },
    /**
     * One crop has to serve every beat, and the beats have different heights:
     * the Assistants step ends at y=530 (the Continue row), while the summary
     * beat's "Installation Progress" panel starts at y=440.
     *
     * 590 clears the Assistants step and the sidebar's last item, and cuts the
     * progress list a row in, which reads as a list continuing rather than as
     * damage. An earlier 500 landed 60px past the "Installation Progress"
     * heading — title, then nothing — which reads as a broken frame.
     *
     * The final beat is then scrolled so the completion banner's bottom edge sits
     * just above this line, putting the capability-gaps panel exactly outside it.
     */
    cropHeight: 590,
    out: 'demo-assistants',
    async run(page, rec, { project }) {
      // Everything up to the Assistants step is setup, not content.
      await detect(page, project);
      await advance(page, 5);
      await page.locator('text=Target Assistants').first().waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForTimeout(800);

      await rec.installCursor();
      await rec.hold(900);

      // Claude Code is already ticked; add three more, each its own beat.
      for (const name of ['Cursor', 'OpenAI Codex CLI', 'Gemini CLI']) {
        await rec.clickAt(page.locator(`text=${name}`).first(), { ms: 620, settle: 200 });
        await rec.hold(420);
      }
      await rec.hold(700);

      await rec.clickAt(exactButton(page, 'Continue'), { ms: 650 });
      await page.locator('text=Installation Summary').first().waitFor({ state: 'visible', timeout: 20_000 });
      await rec.installCursor();
      await rec.hold(2200);

      await rec.clickAt(exactButton(page, 'Start Installation'), { ms: 700 });
      const done = page.locator('text=Installation Complete').first();
      await done.waitFor({ state: 'visible', timeout: 180_000 });

      // The install step's content is taller than the viewport, and the page has
      // scrolled by the time it finishes — so the shot would frame the progress
      // list and cut off the one line that says it worked.
      //
      // `scrollIntoViewIfNeeded` is not enough: it reasons about the 760px
      // viewport while the GIF is cropped to `cropHeight`, so an element at y=700
      // is "in view" for Playwright and absent from the asset. Scroll it to the
      // top explicitly, then assert it actually landed inside the crop.
      const crop = scenes.assistants.cropHeight;
      const MARGIN = 18; // breathing room between the banner and the cut

      // Land the banner's bottom edge just above the crop line, so the gaps panel
      // falls exactly outside it. Measure, nudge, measure again: the panel's height
      // is not known ahead of time and `scrollIntoView` alignments cannot express
      // "bottom at y=N".
      //
      // The nudge must move the element's own scroll container, not the window —
      // this app scrolls an inner div, so `window.scrollBy` is a silent no-op and
      // the banner stays wherever `scrollIntoView` put it, with the warnings still
      // in frame.
      // Measure the whole banner, not the heading. `text=Installation Complete`
      // resolves to the heading alone, and positioning *its* bottom edge at the
      // crop line pushes the "Installed N agents and N MCP servers" line — the
      // part carrying the actual numbers — below the cut.
      const bannerBox = () =>
        done.evaluate((el) => {
          let n = el;
          while (n.parentElement && !/Installed \d+ agents/.test(n.innerText ?? '')) n = n.parentElement;
          const b = n.getBoundingClientRect();
          return { y: b.y, height: b.height };
        });

      await done.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.waitForTimeout(500);

      const first = await bannerBox();
      if (first) {
        const dy = Math.round(first.y + first.height - (crop - MARGIN));
        await done.evaluate((el, delta) => {
          let n = el.parentElement;
          while (n) {
            const s = getComputedStyle(n);
            if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
              n.scrollTop += delta;
              return;
            }
            n = n.parentElement;
          }
          (document.scrollingElement ?? document.documentElement).scrollTop += delta;
        }, dy);
        await page.waitForTimeout(700);
      }

      const box = await bannerBox();
      if (!box || box.y < 0 || box.y + box.height > crop) {
        throw new Error(
          `the completion banner spans y=${Math.round(box?.y ?? -1)}..${Math.round((box?.y ?? 0) + (box?.height ?? 0))}, ` +
            `outside the ${crop}px crop — the payoff would be cut from the GIF.`
        );
      }

      await rec.hold(3000);

      // "Unknown"/"0%" do not apply here, but a failed install must not encode.
      await assertNoFailureText(page, rec.frameDir, ['Installation failed']);
    },
  },
};

export { Recorder };
