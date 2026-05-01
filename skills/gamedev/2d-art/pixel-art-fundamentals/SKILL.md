---
name: gamedev-2d-art-pixel-art-fundamentals
description: |
  Pixel art fundamentals: resolution choice, anti-aliasing rules,
  dithering (Bayer / Floyd-Steinberg / hand-placed), outline philosophy,
  pixel hinting / sub-pixel rules, common mistakes (pillow shading,
  PSD-soft rendering, jaggies).

  USE WHEN: starting a pixel-art project, evaluating sprite quality,
  fixing soft / blurry pixel art, choosing resolution.

  DO NOT USE FOR: vector / painterly 2D art (different rules entirely);
  AI sprite generation (see `unity-2d-core` AI section).
allowed-tools: Read, Grep, Glob
---

# Pixel Art Fundamentals

> **Quick refs**: [dithering-patterns.md](quick-ref/dithering-patterns.md),
> [antialiasing-rules.md](quick-ref/antialiasing-rules.md)

Pixel art = an aesthetic where individual pixels are intentional and
visible. Different rules from "paint at any resolution then downscale"
PSD work.

## Resolution choices

```
Native res    Use case                                    Examples
160 × 144     GameBoy / handheld retro                    Link's Awakening (DX)
240 × 160     GBA-era handheld                            Pokemon GBA, Castlevania
256 × 224     SNES original                               Chrono Trigger
320 × 180     Modern lo-fi 16:9 (1080p × 6)               Celeste
320 × 240     Modern lo-fi 4:3 (480p × 2)                 Stardew Valley
384 × 216     1.2x SNES-ish                               Hyper Light Drifter (rendered higher)
480 × 270     1080p × 4 (clean integer scale)             Many indies
```

Native res = the resolution you draw at. Display scales it integer
(2x, 3x, 4x...) for clean pixels. Non-integer scaling = blurry.

**Choose smaller** = retro, smaller team art budget. **Choose larger**
= more expressive characters, larger animations, but more work per
frame.

## Pixel-perfect display

Always **integer scale**:
- 320×180 native × 6 = 1920×1080 (no blur).
- 320×180 × 5 = 1600×900 (works).
- 320×180 × 4.5 = blurry mess. Avoid.

Engine settings:
- Unity URP 2D: **Pixel Perfect Camera** component (`com.unity.2d.pixel-perfect`).
- Godot: `Project Settings → Display → Stretch Mode = canvas_items` or
  `viewport`.
- Custom: `nearest-neighbor` filter on final present pass; pin camera
  to integer world coords.

## Anti-aliasing in pixel art

Pixel art AA is **selective and manual**. Three approaches:

### 1. No AA (1-bit / chunky)
Just black + 1 fill color. Style: GameBoy DMG, Minit. Great for very
small sprites (≤16×16). Hard at larger sizes.

### 2. Selective AA (most common modern)
Place 1-2 intermediate-color pixels at:
- Diagonal jaggies (where 1-pixel staircase looks too sharp).
- Curve transitions.

NOT at:
- Vertical/horizontal edges (these look fine sharp).
- High-contrast silhouette edges (lose readability).

See [quick-ref/antialiasing-rules.md](quick-ref/antialiasing-rules.md)
for the canonical "where to AA" decision tree.

### 3. Ramp-based AA
Paint sprite using a defined color ramp (5-7 colors from dark to
light). AA = pixels of intermediate ramp values along edges. Looks
cohesive when palette is restricted.

## Dithering

Dithering = placing pixels in a pattern to simulate intermediate colors
between palette entries.

### Bayer / Ordered (4×4 matrix)
Geometric, regular, retro look. Looks digital/clinical. Used in NES
/ early Mac. Works well in backgrounds.

### Floyd-Steinberg / Error diffusion
Algorithmic, scattered, looks like noise. Used in image conversion
tools. Avoid for hand-painted pixel art (looks generated).

### Hand-placed checkerboard
Place dither pattern manually where light hits a surface gradient.
Most expressive — used in Hyper Light Drifter, Owlboy. Time-consuming.

See [quick-ref/dithering-patterns.md](quick-ref/dithering-patterns.md)
for the catalog of dither shapes (50%, 25%, 75%, gradient, edge).

### When to dither

- Smooth gradients in restricted palettes (sky, water, lighting).
- Implied texture (rocky surfaces, foam, smoke).

### When NOT to dither

- Small sprites < 32×32 (looks chaotic).
- High-contrast edges (creates jagged appearance).
- Frequently animated objects (dither shimmers between frames).

## Outline philosophy

Three styles:

### Full outline (NES / SNES era)
Every sprite edge gets a 1-pixel dark outline. Very readable, classic
look. Use case: low-res sprites where readability beats subtlety.

### Selective outline ("selout")
Outline only where sprite would otherwise blend with background.
Modern indie standard. Style of Celeste, Hyper Light Drifter.

### Inline / no outline
Outline replaced by darker shade of fill color (selout taken further).
Or no outline at all. Painterly pixel art (Owlboy, Sword and Sworcery).

### Gradient outline
Outline color shifts along the sprite (warm side / cool side). High
visual quality but expensive to author.

## Pixel hinting / sub-pixel rules

Pixel art breaks if you allow sub-pixel positioning during gameplay:

- **Camera moves at fractional pixel** → sprites jitter.
  Solution: **snap camera position to integer pixel** every frame.
- **Sprite rotated 17°** → arbitrary pixel positions, not "pixel art".
  Solution: pre-render rotation frames, or use 8-frame rotation atlas
  (45° increments).
- **Animation eases between frames with floats** → sub-pixel sprite
  position. Solution: floor() animation positions.

Modern engines have "pixel-perfect cameras" that handle this; on
custom renderers, do it explicitly.

## Common mistakes

### Pillow shading
Light pixels in center, dark pixels around edges, regardless of light
direction. Looks "puffy", uniform, no form. Fix: pick a light source
direction (e.g., upper-left) and shade based on surface normal /
prominence.

### Banding
Long uniform-width stripes of single color along a curve. Breaks form.
Fix: vary the stripe width along the curve or break it with intermediate
shade pixels.

### Jaggies (excessive AA missing)
Sharp "staircase" edges that should curve smoothly. Fix: selective AA
on diagonals.

### PSD-soft rendering
Pixel art that looks like a photo downsampled — full smooth gradients,
soft outlines, anti-aliasing on every edge. Defeats the medium. Fix:
restrict palette, use ramps, hand-place every edge pixel.

### Broken anti-aliasing
AA pixels not in palette ramp (random gray pixels in a green ramp).
Fix: AA only with colors that ARE in the ramp.

### Inconsistent pixel grid
Some sprites at 1x, some scaled non-integer. Fix: every sprite at the
same PPU, integer-only scaling.

## Workflow recommendations

1. **Sketch silhouette** at target resolution. Black-only, judge
   readability.
2. **Block flat colors** from your palette ramp.
3. **Add primary shading** along light direction (1-2 darker shades).
4. **Add highlights** sparingly along light edge.
5. **Selective outline** where needed for separation.
6. **AA pass** on diagonals.
7. **Compare at scale** (zoomed in for detail, at 1x for actual feel).

## See also

- [palettes/SKILL.md](../palettes/SKILL.md) — color ramps + restricted palettes
- [animation-frames/SKILL.md](../animation-frames/SKILL.md) — keep pixel discipline through frames
- [character-design/SKILL.md](../character-design/SKILL.md)
- [tile-design/SKILL.md](../tile-design/SKILL.md)
