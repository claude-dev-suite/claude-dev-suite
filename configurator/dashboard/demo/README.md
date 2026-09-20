# Demo recording

Generates the README's GIFs, plus an MP4 of each for X and anywhere a video is
accepted.

| Scene | Output | Shows |
|---|---|---|
| `detection` | `docs/assets/demo-detection.*` | A monorepo it has never seen, read from its manifests |
| `assistants` | `docs/assets/demo-assistants.*` | Four assistants selected, then installed from one catalog |

```bash
cd configurator/dashboard
npm run demo                 # both scenes
npm run demo -- assistants   # one
```

Prerequisites: the dashboard server and UI built, and `ffmpeg` + `ffprobe` on PATH.
`make-demo.mjs` checks both before it starts rather than failing halfway.

Each scene is re-run against a freshly created fixture, because the `assistants`
scene installs into it and a second pass over an already-configured project takes a
different route through the wizard.

## Why this is generated rather than filmed

The wizard changes every release and the catalog grows continuously. A hand-recorded
demo is stale the week after it ships, and nobody re-records it — so the README ends
up showing a product that no longer exists. Here the footage *is* the output of a
script: when the UI moves, run one command and the asset is current.

## What the pipeline does

| File | Job |
|---|---|
| `fixture-project.mjs` | Builds the project being demoed: a monorepo with a React/Vite workspace and a Spring Boot module, plus Postgres in compose. Detection then has something real to report |
| `scenes.mjs` | What each scene does, its viewport and its crop height |
| `recorder.mjs` | Frames, holds, and the drawn cursor — shared by every scene |
| `record-demo.mjs` | Runs one scene to frames |
| `make-gif.mjs` | Crops, scales, and encodes one scene's GIF and MP4 with ffmpeg |
| `make-demo.mjs` | Orchestrates the lot, with a dashboard on an ephemeral port in between |

`.frames/` is gitignored; only the encoded files are committed.

Adding a scene is an entry in `scenes.mjs`: a viewport, a crop height, an output
name, and a `run(page, rec, { project })`. Everything else is shared.

## Things that will bite whoever changes this

**Playwright draws no mouse pointer.** Not a bug in this script —
[microsoft/playwright#6629](https://github.com/microsoft/playwright/issues/6629) is
still open. A recording of clicks with no visible cursor is unreadable, so
`record-demo.mjs` injects its own and animates it between targets. If you remove that,
the demo silently becomes useless rather than breaking.

**Frames, not `recordVideo`.** Playwright's video option quietly scales output to fit
800×800, and the pacing then depends on how fast the machine rendered. Discrete
screenshots assembled by ffmpeg give exact timing and full resolution.

**The path is typed with `fill()`, deliberately.** `Step1Detection`'s auto-detect
effect fires on every change to `projectPath`, so typing a path character by character
sends one detection request per keystroke — and the partial value `C:\` is absolute
enough to return `200` with `project_type: "unknown"`, which latches
"Unknown / Not detected / 0% confidence" onto the panel for the rest of the typing.
Clicking Detect afterwards recovers it, so it is transient rather than a dead end, but
filming it would mean a README loop that spends two seconds saying dev-suite cannot
read your project.

**The fixture lives outside `os.tmpdir()`.** On Windows that resolves under
`C:\Users\<name>\AppData\Local\Temp`, and the wizard renders the path it was given —
so the maintainer's username would be burned into a committed asset. It uses
`C:\Users\Public` (and `/tmp` elsewhere) instead.

**`getByRole('button', { name: 'Detect', exact: true })`, never `has-text("Detect")`.**
The latter also matches the sidebar's "1 Detection — Analyze project" step button, and
`.first()` then clicks the navigation instead of the action.

**The run fails loudly on a bad detection.** If the results panel still says "Unknown",
"Not detected" or a standalone `0%`, the scene writes `FAILED.png` and exits non-zero
rather than encoding a demo of a broken run. (Check for `0%` with a boundary —
`"100%".includes("0%")` is true, and the naive version rejected every success.)

**Scrolling is asserted, not assumed.** `scrollIntoViewIfNeeded` reasons about the
full viewport while the GIF is cropped to `cropHeight`, so an element can be "in view"
for Playwright and absent from the asset — which is how the first `assistants` cut
framed the progress list and cut off the line saying it worked. The scene now scrolls
explicitly and throws if the payoff lands outside the crop.

**The `assistants` crop stops above the capability-gaps panel**, deliberately. The
installer lists what each assistant cannot do — Cursor rule templates, Codex trust,
Gemini rules — which is a virtue of the tool, but it is six amber lines nobody can read
in a twelve-second loop with no pause button. They are written out in the README's
Multi-Assistant section instead, where they can be. If you widen the crop, widen the
hold too, or it just reads as a wall of warnings.
