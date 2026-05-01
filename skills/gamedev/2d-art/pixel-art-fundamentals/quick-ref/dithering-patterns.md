# Dithering patterns reference

Dithering = placing pixels in a pattern to create the illusion of
intermediate colors between two palette entries.

## Basic ratios

### 50% (checkerboard)
```
■ □ ■ □
□ ■ □ ■
■ □ ■ □
□ ■ □ ■
```
Half pixels of color A, half of color B. Most common dither pattern.

### 25% B (sparse)
```
■ ■ ■ ■
■ □ ■ ■
■ ■ ■ ■
■ ■ □ ■
```
Few B pixels. Used for "almost A but slightly toward B" — surface
fading toward shadow.

### 75% B (dense)
Inverse of 25%. Used near full B color but with few A pixels for
texture.

### Bayer 4×4 (ordered)
```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```
Each cell lit if value < threshold. Threshold sweeps from 0 to 15
to fade A → 50/50 → B. Mathematically clean. Looks digital. Used in
NES.

### Bayer 2×2 (small)
```
0 2
3 1
```
Tighter. Good for small areas where 4×4 looks coarse.

## Hand-placed shapes

For organic surfaces (rocks, water, cloth), use these patterns NOT in
strict mathematical ratio but placed by hand:

### Vertical stripes (50%)
```
■ □ ■ □
■ □ ■ □
■ □ ■ □
```
Used for: vertical light/shadow gradients on cylinders.

### Horizontal stripes (50%)
```
■ ■ ■ ■
□ □ □ □
■ ■ ■ ■
□ □ □ □
```
Used for: horizontal terrain bands, water surface.

### Diagonal lines
```
■ □ □ ■
□ ■ ■ □
■ □ □ ■
□ ■ ■ □
```
Decorative pattern for mosaic / tile texture.

### "Dots" (25% sparse)
```
□ □ ■ □
□ □ □ □
■ □ □ □
□ □ □ ■
```
Texture noise, dust, foam.

### "Bricks" (50% offset)
```
■ ■ □ □
■ ■ □ □
□ □ ■ ■
□ □ ■ ■
```
2x2 block pattern. Used for masonry, larger texture.

## Where to place dithering

### YES dither
- **Smooth gradients in restricted palettes**: sky from light blue to
  white — without dither, you see hard banding.
- **Implied texture**: rocky surface, smoke, foam.
- **Edges between two large flat regions** (transition gradient).

### NO dither
- **Small sprites < 32×32**: dither pixels look like noise.
- **High-contrast edges**: makes silhouette jagged.
- **Frequently animated objects**: dither shimmers between frames
  → annoying flicker.
- **UI elements**: clean look needed.

## Dither + animation

If dither is on a moving sprite, the dither pattern must STAY ALIGNED
with the sprite, not the world. Otherwise the dither "scrolls" across
the sprite frame-to-frame, producing visible noise.

In code: dither generated procedurally in a shader needs sprite-local
coords, not screen-space coords.

## Tools

- **Aseprite**: brush with custom dither tip (define a 4×4 brush
  pattern, pressing paints in that pattern).
- **Photoshop**: noise filter with Bayer matrix, or custom pattern
  fill.
- **Hand**: just paint pixel by pixel.

## Common mistakes

- **Floyd-Steinberg dither in pixel art**: looks generated, not hand-
  crafted. Reserve for image conversion, not authoring.
- **Random scattering instead of pattern**: looks noisy / messy. Even
  hand-placed dither should follow a recognizable pattern locally.
- **Dither across silhouette edge**: breaks edge clarity. Stop dither
  at silhouette.
- **Dither on tiny sprites**: <32×32 → looks like dirty pixels, not
  dithering.
