# Demo recording

Generates `docs/assets/demo-detection.gif` (README) and `.mp4` (X, and anywhere a
video is accepted).

```bash
cd configurator/dashboard
npm run demo
```

Prerequisites: the dashboard server and UI built, and `ffmpeg` + `ffprobe` on PATH.
`make-demo.mjs` checks both before it starts rather than failing halfway.

## Why this is generated rather than filmed

The wizard changes every release and the catalog grows continuously. A hand-recorded
demo is stale the week after it ships, and nobody re-records it — so the README ends
up showing a product that no longer exists. Here the footage *is* the output of a
script: when the UI moves, run one command and the asset is current.

## What the pipeline does

| File | Job |
|---|---|
| `fixture-project.mjs` | Builds the project being demoed: a monorepo with a React/Vite workspace and a Spring Boot module, plus Postgres in compose. Detection then has something real to report |
| `record-demo.mjs` | Drives the wizard and captures frames |
| `make-gif.mjs` | Crops, scales, and encodes the GIF and MP4 with ffmpeg |
| `make-demo.mjs` | Runs all three, with a dashboard on an ephemeral port in between |

`.frames/` is gitignored; only the two encoded files are committed.

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
"Not detected" or a standalone `0%`, `record-demo.mjs` writes `FAILED.png` and exits
non-zero rather than encoding a demo of a broken run. (Check for `0%` with a boundary —
`"100%".includes("0%")` is true, and the naive version rejected every success.)
