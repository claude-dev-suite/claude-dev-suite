---
name: gamedev-2d-art-seamless-textures
description: |
  Seamless / tileable textures for 2D: offset-and-paint trick, mirror
  techniques, repetition reduction (variant tiles + decoration overlays),
  transitional tiles (corner / edge / T-junction), normal map authoring
  for 2D lighting (Sprite Lamp / Sprite DLight / Materialize), procedural
  base + hand-pixel overlay, roof/floor/wall specializations.

  USE WHEN: painting tilesets that don't visibly seam, fixing repetition,
  adding normal maps to 2D for dynamic lighting, mixing procedural and
  hand-painted texture.
allowed-tools: Read, Grep, Glob
---

# Seamless / Tileable Textures

A "seamless" texture wraps without visible seam at the edges. Critical
for any tile that fills regions (grass, dirt, stone, water).

## The offset-and-paint trick

Standard workflow to make any texture seamless:

```
1. Open your texture (e.g., 32×32 px) in Aseprite/PS/Krita.
2. Filter → Offset/Wrap by (16, 16) — the seam now runs through center.
3. Paint over the visible seam with clone-stamp / hand pixel.
4. (Optional) Offset back by (-16, -16) to verify no new seam.
5. Place 2×2 copies of your tile in a test area and inspect.
```

In Aseprite: `Edit → Shift → Wrap` (or simply `Filters → Offset` in
v1.3+). Krita: `Filter → Other → Offset`. Photoshop: `Filter → Other →
Offset`.

## Mirror techniques

Quick seamless without offset paint: mirror horizontally + vertically.
Always seamless because edges are mirrored to themselves.

Trade-off: visible mirror symmetry at the seam line. Fine for organic
materials (rocks, dirt) viewed at small scale, terrible for anything
recognizable (bricks would mirror to fake structure).

## Repetition reduction

A single seamless tile placed 100 times is **visibly repetitive**, even
if seamless. Solutions:

### Variant tiles
Paint **3-5 variants** of the "interior" tile. Random selection at runtime
(weighted: 70% common, 25% mid, 5% rare). Breaks pattern.

LDtk handles natively via Auto-Layer rules with variant frequency.
Unity Tilemap: custom Rule Tile with random tiles.

### Decoration overlays
Sparse decorative sprites (a flower, a crack, a leaf) painted ON TOP of
the seamless tile layer. ~5% coverage. Massive perceived variety from
small art investment.

### Detail tiles
Tiles that look like the base interior but have a hand-painted detail
(a vein in stone, a clump of grass). Insert occasionally. Same effect
as decoration overlays but stays in the tilemap layer (cheaper for
collision).

## Transitional tiles

Where two terrains meet, paint:

- **Edge** (cardinal): grass→dirt N, E, S, W (4 + mirrors).
- **Outer corner** (convex): dirt poking into grass (4).
- **Inner corner** (concave): grass wrapping dirt (4).
- **T-junction** (3-way): grass on 3 sides (4) — often skipped.
- **Cross** (4-way): full surround (1) — often skipped.

47-tile RPGMaker schema covers all cases. 16-tile Wang skips diagonals
(corner ambiguity).

For terrain hierarchy (grass < dirt < stone), one set of transitions
between adjacent levels is enough; non-adjacent transitions (grass →
stone) can compose grass→dirt + dirt→stone vertically.

## Normal maps for 2D lighting

Normal maps add **dynamic lighting** to 2D sprites. Each pixel encodes
a 3D surface normal in RGB:
- R = X-axis component
- G = Y-axis component
- B = Z-axis component
- Flat surface = (0.5, 0.5, 1.0) = #8080FF (purplish).

Authoring options:

### Hand-painted (best quality)
Paint the normal map alongside the diffuse. Deep cyan = surface tilted
left, deep magenta = right, green tints = up, purple = down. Time-
consuming. Used in Owlboy, Dust: An Elysian Tail.

### Sprite Lamp (semi-automatic)
You provide 3-4 lighting passes (top, right, etc.), tool generates
normal map. ~$15. Quality very good.

### Sprite DLight (procedural)
Just provide the diffuse. Tool generates a "good enough" normal from
shape. Quick, less accurate.

### Materialize (free, FOSS)
Generate normal + height + AO from a diffuse. Less specialized for
pixel art but free.

### NormalMap-Online / nlmtools
Quick browser-based gen.

### Engine integration

- **Unity URP 2D**: assign Normal map secondary texture in Sprite
  Renderer. Light 2D respects it.
- **Godot**: shader on canvas item samples normal texture.
- **Custom**: standard tangent-space normal lighting.

## Procedural + hand-pixel hybrid

For organic surfaces (rock, dirt, grass), efficient workflow:

1. Generate Perlin/Worley noise base in your tool of choice (Substance,
   Krita filter, Aseprite plugin, Filter Forge, hand-coded).
2. Crush the result into your palette (indexed mode → posterize).
3. Hand-paint over the result: clean up artifacts, add intentional
   features, define edges.
4. Apply offset-paint trick to make seamless.

Saves hours vs pure hand-paint. Looks more natural than pure procedural.

## Specialized surfaces

### Roof / shingle patterns
- Use staggered rows (alternating offset) for visual interest.
- Highlight edge of each shingle.
- 2-row tile (offset 0 + offset 16) seamless when stacked.

### Floor / tile patterns
- Geometric grout lines OR organic stones.
- For geometric: ensure tile size is exact divisor of pattern (avoid
  mismatched alignment).
- Add wear/dirt overlay sparingly.

### Wall patterns
- Often 9-slice candidate (corner stays, middle stretches).
- Or use vertical strip + repeat.
- Vary brick offset rows (running bond pattern).

### Water / sky
- Animated 2-4 frame loop is more important than seamless.
- Subtle horizontal scroll of the texture creates drift effect.
- Layer 2-3 textures at different scroll speeds for parallax-ish water.

## Common bugs

- **Visible seam after offset**: didn't fully cover the seam in step 3.
  Re-offset and check.
- **Texture bleeding** between tiles in atlas: solve with 1-2 px
  padding (TexturePacker `--extrude`, Aseprite Sprite Sheet export
  with padding).
- **Normal map looks wrong direction**: G channel inverted (DirectX vs
  OpenGL convention). Most engines have a flip toggle in Sprite Renderer.
- **Atlas downscaling blurs tile edges**: use POT atlases, nearest-neighbor
  sampling, no mipmaps for 2D pixel art.
- **Variant frequency too high**: dominant variant over 80% looks like
  no variation. Tune 60-70% for the "common" tile.
- **Mirror seam visible** in detailed textures: switch to offset-paint.

## See also

- [tile-design/SKILL.md](../tile-design/SKILL.md)
- [lighting-art/SKILL.md](../lighting-art/SKILL.md) — using normal maps in 2D Lights
- [tools/SKILL.md](../tools/SKILL.md) — Aseprite, TexturePacker, Sprite Lamp
