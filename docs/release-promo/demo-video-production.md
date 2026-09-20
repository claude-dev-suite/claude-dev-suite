# Demo video — production

Content and beats live in `demo-video-outline.md`. This file is only about how to make it.

Researched September 2026. Prices change; re-check before buying anything.

---

## What is ruled out, and why

| Ruled out | Reason |
|---|---|
| **Screen Studio** | macOS only. The Windows request on its public roadmap is still "In Review", filed ~4 years ago, no date. |
| **Tango** | Outputs step-by-step screenshot guides, not video. Fine for docs, wrong for YouTube. |
| **Sora** | OpenAI discontinued it: app shut down 2026-04-26, **API sunsets 2026-09-24**. |
| **Text-to-video for the demo itself** (Veo, Runway, Pika, Kling) | Two independent killers. These models still cannot render legible on-screen text and UI — the documented, consistent failure mode, and worse on moving elements. This demo is a dashboard full of small text, file paths and checkboxes: the worst possible case. And they generate *imagined* footage, so a generated dashboard is not the real one — for a tool whose credibility rests on "this is what actually happens", that is counterproductive and arguably misleading. Veo also caps at 8 seconds per generation. |
| **ElevenLabs free tier** | Explicitly **non-commercial**, *and* requires "elevenlabs.io" in the video title. Attribution does not substitute for a licence. Never ship a free-tier render. |

Generative video is fine for a 3–5 second abstract title card. A static card in Canva does
that job for $0 and looks less generic.

---

## Pipeline A — the one this project should end up with

**Playwright drives the demo; the footage regenerates in CI.**

The reason this is not a novelty here: the whole premise of dev-suite is that the catalog
keeps growing and the wizard keeps changing. A hand-recorded demo is stale the moment the
UI moves. A scripted one is not.

**Already true in this repo, verified:**

- `@playwright/test` **1.62.1** is installed (`configurator/dashboard/package.json:45`).
- `page.screencast()` landed in Playwright **1.59**, and `screencast` is present in the
  installed type definitions. **Nothing needs upgrading.**

The API surface that matters:

```ts
await page.screencast.start({ path: 'demo.webm', size: { width: 1920, height: 1080 } });
// …drive the wizard…
await page.screencast.stop();
```

plus `showActions()` (highlights the element being interacted with and prints the action
title), `showChapter()` and `showOverlay()`. Microsoft shipped these specifically so agents
could produce annotated walkthrough videos with timestamped chapters — which is exactly
this job.

**Fill the gaps with [`playwright-recast`](https://github.com/ThePatriczek/playwright-recast)**
(MIT, npm). It parses the Playwright trace and renders video with an **animated cursor
overlay between clicks**, click ripples, auto-zoom to actions, speed-up of idle time,
TTS voiceover (OpenAI / ElevenLabs / Polly), loudness normalisation, burned-in subtitles,
and MP4 output.

### Limits to plan around

- **No cursor.** Playwright does not render a mouse pointer in video — still open as
  microsoft/playwright#6629. `playwright-recast`'s cursor overlay is the fix; without it
  the demo is unreadable.
- **Resolution.** The classic `video` option silently scales output to fit **800×800**.
  Set the size explicitly or ship a soft 800px video.
- **No audio, ever.** Narration is a separate track muxed with ffmpeg.
- **WebM out.** ffmpeg + ffprobe must be on PATH for MP4.
- **Browser only.** This records the *page*, not the OS — the Electron title bar, native
  menus and OS file dialogs will not appear. For this demo that is ~95% fine, since the
  dashboard is React served by Express, but a native file-picker beat must be cut or faked.
- **Flush on close.** `await context.close()` before reading the video path.

**Cost:** ~$0.02 per regeneration with OpenAI TTS (`gpt-4o-mini-tts`, ~$0.015/min; the
90-second script is ~1,300 characters). **Build time:** 6–10 hours, mostly writing the
scene script.

---

## Pipeline B — what to do first, this week

Pipeline A is the right destination and the wrong starting point: it costs a long
afternoon before there is anything to show. Do this instead, then rebuild.

| Step | Tool | Cost |
|---|---|---|
| Record + auto-zoom + cursor smoothing | **[Cap](https://cap.so)** — AGPL open source, Windows, no watermark on any tier | Free personally; **$29/yr Desktop License** for unambiguous commercial rights |
| Voiceover | **ElevenLabs Starter**, cancel after one month | **$6** |
| Trim / captions | Cap's Studio Mode, or **DaVinci Resolve free** (no watermark, no time limit, UHD cap) | $0 |
| 9:16 crops for X | Resolve | $0 |

**Total $6–$35, one afternoon.** Cap being open source is also on-brand to mention.

**Free voiceover alternative:** Google **Chirp 3: HD** has a permanent **1M characters/month
free tier** with full commercial rights and no attribution — roughly 700 scripts this
length, for $0. Slightly more setup than ElevenLabs, materially cheaper than $6/mo forever.

**Avoid OpusClip for the X crops:** its free exports are watermarked *and* expire after
three days.

---

## Pipeline C — if you want one tool and no learning

**Descript**, end to end: record, paste script, AI voice, edit by deleting words from the
transcript, auto-captions, export 4K watermark-free. Windows 11 native, needs a dedicated
GPU with a 2021+ driver for the screen recorder. Roughly **$24–$35 for one month**, 2–4
hours. Most expensive, least new tooling, and the result still goes stale.

---

## YouTube

- **Chapters**: first timestamp must be `00:00`, minimum three, ascending, each ≥10s. At 90
  seconds that is exactly three — `0:00 Problem` / `0:25 Detect & select` / `0:55 Generated
  config`. Manual chapters override auto-chapters.
- **Upload an SRT** rather than trusting auto-captions. It gets `.mcp.json`, `AGENTS.md`,
  "Codex" and "Kimi" right, and that text is indexed.
- **Thumbnail**: 3840×2160 recommended, 16:9, under 2 MB on mobile upload. Three to five
  words of large high-contrast text, matching the first ten seconds. A legible product
  screenshot beats a face for a dev tool.
- **Title**: lead with the outcome and the named ecosystem, tool name last — e.g.
  *"Auto-configure Claude Code, Copilot and Cursor for any repo in 60 seconds"*.
- **What the algorithm weighs in 2026**: click-through and average view duration still
  dominate, but satisfaction and post-watch behaviour now outweigh raw watch minutes. A
  fully-watched 90-second video beats a padded eight-minute one — which suits this.
- **Publish a Short too**, as a trailer pointing at the real video. The 9:16 crops made for
  X are the same asset.

## GitHub README

GitHub does not autoplay embeds. Use a **clickable thumbnail image linking to YouTube**,
optionally with a short silent GIF above it. Limits: **10 MB for images/GIFs**, 10 MB for
video on free plans. H.264 MP4 recommended.

---

## Recommendation

**Pipeline B now, Pipeline A in the next quiet week.** $6 and an afternoon gets a video
shipped; the Playwright rebuild then makes it permanent, regenerating in CI for two cents
whenever the dashboard changes. For a project whose premise is a growing catalog, that is
worth more than the polish of any $50/month SaaS.

---

## Unverified

From the research, flagged rather than trusted: **PlayHT** appears defunct (`play.ht` did
not resolve; reports of a Meta acquisition and wind-down). **VEED**, **Descript**,
**Rapidemo**, **AutoZoom** and **ScreenKite** prices come from secondary sources — confirm
at checkout. The Shorts-vs-long-form performance figures are marketing-blog sourced; treat
the direction as sound and the numbers as soft.
