---
name: gamedev-2d-art-ai-art-tools
description: |
  AI-assisted 2D / pixel-art generation tools and services. Covers
  pixel-art-specific generators (PixelLab, Retro Diffusion), game-asset
  generators (Scenario, Leonardo.AI), DIY Stable Diffusion + LoRAs, and
  general models with pixel-art prompting (Midjourney, DALL-E, Imagen).
  Trade-off framework: control vs. speed, palette consistency, animation
  coherence, tile-ability, commercial license, runs locally vs. cloud,
  cost per asset / per month.

  USE WHEN: deciding which AI tool fits a project, generating placeholder
  assets, generating final assets at scale, integrating an AI sprite
  pipeline, evaluating commercial license, comparing API costs.

  DO NOT USE FOR: hand-painted-only workflows (use `tools` skill),
  3D / model generation (out of scope), engine integration of finished
  sprites (use `tools` + engine-specific skill).
allowed-tools: Read, Grep, Glob
---

# AI Pixel-Art / 2D Art Tools

> Companion to [`tools/SKILL.md`](../tools/SKILL.md) (hand-authoring DCCs:
> Aseprite, Tiled, LDtk, etc.). This file focuses on AI-driven generation.

## Decision in 30 seconds

| Goal | Pick |
|------|------|
| Pixel art with consistent palette + animations | **PixelLab** (purpose-built) or **Retro Diffusion** (local) |
| Many style-locked assets for a single project | **Scenario** (custom-trained model per project) |
| One-off concept art, mood boards, painterly 2D | **Midjourney** or **Leonardo PhotoReal** |
| Full control + free + offline | **Stable Diffusion + pixel-art LoRA** |
| Generate a tileset / icon set | **PixelLab** (tilemap mode) or **Scenario** (with tile prompt) |
| In-engine, no external pipeline | **Scenario** or **Leonardo** (both have Unity / Unreal SDKs) |

The first instinct should usually be: **placeholder = AI, final = human**.
AI is great to unblock prototyping; final shipped art usually still
benefits from a human pass for cohesion.

## The contenders

### PixelLab (pixellab.ai)

Purpose-built for pixel art. Models trained on pixel sprites, not natural
images, so output is genuinely pixel-perfect (no fake "pixel filter on a
photo" artifacts).

- **Strengths**: native sprite-sheet output, **animation generation**
  (skeleton + interpolation), **rotation / pose control**, palette
  selection, tilemap mode, **Aseprite plugin** (generate inside the DCC).
- **API**: REST, returns PNG + sidecar JSON (palette, pose data).
- **Pricing**: subscription, credits per generation. Free tier limited.
- **License**: commercial use OK on paid tiers, generated assets are
  yours.
- **Weakness**: smaller stylistic range than general models; opinionated
  output style.

### Scenario (scenario.com)

Train a custom model on **your** project's reference art. Lock the style
across thousands of generations.

- **Strengths**: per-project style consistency, **ControlNet-like**
  prompts (sketch → asset, depth → asset), batch generation, in-app
  editor, **tile-able mode**, **isometric mode**.
- **API**: REST + Unity/Unreal SDKs.
- **Pricing**: subscription tiers, GPU-hours model.
- **License**: commercial use, full ownership of generated assets.
- **Sweet spot**: studios shipping a game with a specific visual identity
  who'd otherwise burn weeks on manual asset variation.

### Leonardo.AI

General-purpose image generator with strong game-asset focus.

- **Strengths**: **PixelArt model** built-in, image-to-image, **tile-able
  toggle**, large library of community fine-tunes, decent free tier.
- **Weakness**: pixel art is one mode among many — not as dialled in as
  PixelLab.
- **API**: REST, async job model.
- **Pricing**: token-based subscription.
- **License**: Pro tier required for commercial use of generated assets.

### Retro Diffusion (retrodiffusion.ai)

Stable Diffusion fine-tune specialized in pixel art. Runs **locally** if
you have the GPU; also offered as a hosted service.

- **Strengths**: full control (you own the weights), zero per-image cost
  if running locally, plays nice with ComfyUI / Automatic1111 workflows,
  **Aseprite extension**.
- **Weakness**: needs a competent GPU (8 GB+ VRAM) for local; setup is
  not turn-key.
- **License**: model licensed per their terms (check for commercial
  shipping); generated images are yours.

### Stable Diffusion + LoRAs (DIY)

Bring your own model. Common pixel-art LoRAs:
**All-In-One-Pixel-Model**, **Pixel Art XL**, **PixelLandscape**,
**M_Pixel_Style**.

- **Strengths**: free, total control, integrate into any pipeline
  (ComfyUI graph nodes), composable with ControlNet, IP-Adapter, etc.
- **Weakness**: steepest learning curve; results vary widely with
  prompting; need to manage models / versions / seeds yourself.
- **Best for**: technical artists who want a programmable pipeline, or
  cost-sensitive solo devs.

### General-purpose (Midjourney, DALL-E 3, Imagen 3)

Not pixel-art specialists. Useful for:
- Concept art, mood boards, palette inspiration.
- Higher-resolution painterly 2D (UI illustrations, key art, marketing).
- "Pixel art–style" output is hit-or-miss; usually ends up as
  pixel-filtered raster, not true pixel art.

Don't ship sprites straight out of Midjourney unless the visual identity
intentionally embraces that look (e.g. some indie titles use it for
backdrops, not characters).

## Comparison matrix

| Tool | Pixel-true | Animation | Tile-able | Custom style | Local run | Commercial OK | Sweet spot |
|------|-----------|-----------|-----------|--------------|-----------|---------------|------------|
| **PixelLab** | YES | YES (skeleton interp) | tileset mode | preset styles | NO | paid tier | sprites + animations |
| **Scenario** | depends on model | NO (static) | YES | YES (per-project) | NO | YES | style-locked asset libraries |
| **Leonardo** | mode | NO | YES | community LoRAs | NO | Pro tier | mixed 2D + concept |
| **Retro Diffusion** | YES | NO | depends | yes via finetune | YES | check license | free local pixel art |
| **SD + LoRA (DIY)** | depends | with AnimateDiff | tileable LoRAs | full | YES | per LoRA license | pipeline builders |
| **Midjourney** | NO (raster filter) | NO | mode | style ref | NO | Pro tier | concept art / key art |

## Integration patterns

### Aseprite plugin (PixelLab, Retro Diffusion)
Generate directly inside the DCC. Output lands as a new layer or sprite
sheet ready to clean up. **Best for indies** — minimal context switching.

### REST API → engine pipeline (Scenario, Leonardo, PixelLab)
Build an editor-time tool inside Unity/Godot that calls the API on
demand, drops the result into the project asset folder. **Best for
studios** producing many variants (skins, recolors, palette swaps).

### ComfyUI graph (SD + LoRA + ControlNet)
Programmable node graph: input sketch → ControlNet → LoRA → upscale →
posterize. Runs locally. **Best for technical artists** who want
reproducible pipelines.

### Batch script (Python + API)
For asset libraries (icons, portraits, items): script generates N
variants, hand-pick the best. Common for card games, RPG item sets.

## Hybrid workflows that work

Pure-AI rarely ships untouched. The patterns that actually work:

- **AI for variants, human for hero assets**: hand-paint the player
  character, AI-generate 50 NPCs in the same style.
- **AI generates → human cleans**: faster than from-scratch, more cohesive
  than raw AI.
- **AI for palette / mood, human for sprites**: use Midjourney to lock the
  palette and atmosphere, hand-paint the sprites.
- **AI for placeholder, human for shipped**: prototype with AI, replace
  with hand-pixel as the design firms up.

## Cost reality check (May 2026 pricing)

| Tool | Entry tier | Per-image (typical) | Notes |
|------|------------|--------------------|---------------------|
| PixelLab | $10–20/mo | ~$0.05 | Subscription with credit pool |
| Scenario | $20–80/mo | ~$0.02–0.10 | GPU-hour metered |
| Leonardo | $10–30/mo | ~$0.01–0.05 | Token system |
| Retro Diffusion (hosted) | $5–20/mo | ~$0.02 | Local = free |
| Stable Diffusion local | $0 | $0 | Hardware + electricity |
| Midjourney | $10–60/mo | ~$0.02 | GPU-hour metered |

For a 100-asset library: ~$2–10 with most paid tools, ~$0 local. For a
1000-asset library: paid tools become real costs; local SD wins.

## Anti-patterns

| Anti-Pattern | Why it bites | Better |
|--------------|--------------|--------|
| Ship raw AI sprites without cleanup | Inconsistency, weird artifacts, inhuman silhouettes | Always at least a polish pass |
| Mix outputs from 3+ different models | Style drift, palette chaos | Lock to one tool / style |
| Generate at high res then downscale to "pixel art" | Anti-aliasing artifacts; not real pixel art | Use a pixel-art-specific tool |
| Trust the "tile-able" toggle on general models | Often visible seams | Test with a 4×4 grid before committing |
| Forget the commercial license | Free tier ≠ commercial use on most platforms | Read the ToS for every tool you ship from |
| Animate by generating per-frame independently | No frame-to-frame coherence; flicker | Use animation-aware tools (PixelLab, AnimateDiff) or interpolate |
| Use AI for hero / promotional art | Marketing art is judged harshly; AI shows | Hand-do the cover, key art, store icons |

## See also

- [tools/SKILL.md](../tools/SKILL.md) — hand-authoring DCCs (Aseprite, Tiled, LDtk)
- [palettes/SKILL.md](../palettes/SKILL.md) — palette discipline (lock the palette before AI generation)
- [pixel-art-fundamentals/SKILL.md](../pixel-art-fundamentals/SKILL.md) — what counts as "real" pixel art (so you can tell when AI gets it wrong)
- PixelLab API docs: https://www.pixellab.ai/docs
- Scenario docs: https://docs.scenario.com/
- Retro Diffusion: https://retrodiffusion.ai/
- Civitai (LoRA library): https://civitai.com/
