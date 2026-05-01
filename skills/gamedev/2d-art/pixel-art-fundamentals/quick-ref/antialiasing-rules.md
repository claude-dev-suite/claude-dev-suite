# Pixel-art anti-aliasing rules

Pixel art AA is **selective and manual**. The rules below decide WHERE
to place AA pixels.

## Where to AA

### YES on diagonal lines
A 1-pixel staircase along a diagonal looks too sharp. Add 1 intermediate
shade pixel at each "step" corner.

```
Without AA:           With AA:
███                   ███
   ███                ░░░███
      ███                ░░░███
```
The `░` pixels are an intermediate shade halfway between fg and bg.

### YES on curves
Where a curve transitions between row/column extents, AA softens the
inflection.

### MAYBE on outer silhouette edges
Helps the sprite blend with bg, but reduces contrast vs bg. Test
visually. Selective edge AA = OK; blanket AA on every edge = soft /
mushy.

### NO on horizontal / vertical edges
Sharp horizontals and verticals look fine sharp. AA on them produces
"blurry" feel.

### NO on high-contrast silhouette edges
Black sprite against white bg → AA pixel = gray = looks like noise.
Keep silhouette crisp.

### NO inside a flat region
Random AA pixels in interior = looks dirty. Save AA for edges.

## Choose AA color

The AA pixel must come from the palette. Two strategies:

### From the same ramp
If the edge is between dark blue (#1a3a6e) and light blue (#88a8d0),
use a mid-blue (#5278a8) — the next ramp entry. Matches palette.

### Toward the bg
If edge is between sprite color and bg, AA toward bg color. Sprite
"melts" softly into bg.

### Toward a darker shade
For outline-style AA, use a slightly darker version of fg, not toward
bg. Sprite stays distinct.

## Selective outline ("selout") technique

Combine AA with selective outlining:

```
Standard outline:        Selout:
░░░░░░░░░                ░░░░░░░░░
░██████████░             ░██████████░  (no outline here, blends)
░██████████░             ██████████
░██████████░             ██████████
░░░░░░░░░                ░░░░░░░░░
```

Only outline edges that need separation from bg. Inner pixel becomes
the "outline" via being darker shade of fg. Modern indie pixel-art
standard.

## Curves: where to place AA pixels

For a 45° line getting wider (like a wing):
```
[curve]      [AA dots placed at corner positions]
   █              █
   ███            █░█
   ████░          █░█░
   █████░░        █░█░░
```

The AA dots fill the "step" between rows of different widths.

## When to skip AA entirely

- **Very small sprites (< 16×16)**: AA pixels become sprite-internal
  noise.
- **Strict 1-bit / 2-color palette**: AA needs a third color.
- **Specific style** (Cuphead, Minit) — deliberate sharp pixel feel.

## Common mistakes

- **AA pixels not from palette**: introduces colors you didn't intend.
  Always pick from existing palette ramp.
- **Blanket AA**: every edge has AA → blurry mushy sprite. Selective
  only.
- **AA in corners of squares**: a 2×2 sprite corner doesn't need AA;
  it's just 4 pixels. Save for diagonals.
- **Inconsistent AA across animation frames**: AA placement varies
  → animation shimmers. Use onion skin to verify consistent AA.
- **AA against transparent bg in image, but rendered against varied
  bg in game**: pre-multiplied AA might look wrong. Test in game
  context.

## Decision tree

```
Edge is...
  diagonal / curved → AA YES
  vertical / horizontal → AA NO
  outer silhouette + bg known + bg has matching color → AA MAYBE
  outer silhouette + bg varies in game → AA NO
  inside flat region → AA NO
```

## Tools

- **Aseprite**: just paint manually with mid-color from palette.
- **No automated AA tool worth using** for pixel art — automated AA
  destroys the medium. Manual placement only.
