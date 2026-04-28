---
name: unity-2d-core
description: |
  Unity 2D fundamentals — Sprite Renderer, Sprite Atlas v2 (master/variants),
  9-slice rendering, Sorting Layers vs Order in Layer vs Sorting Group, sprite
  import settings, Pixels Per Unit (PPU), Pixel Perfect Camera, point filtering.

  USE WHEN: importing sprites, packing atlases, controlling draw order in 2D,
  setting up pixel-art rendering, configuring 9-slice UI/decorations.

  DO NOT USE FOR: Tilemap (use `unity-2d-tilemap`); 2D physics (use
  `unity-2d-physics`); animation (use `unity-2d-animation`); 2D Lights (use
  `unity-2d-lighting`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Core

## Sprite import settings (pixel art)

```
Texture Type        Sprite (2D and UI)
Sprite Mode         Single (or Multiple for sprite sheets)
Pixels Per Unit     32 (or 16 / 64 — pick ONE project-wide)
Mesh Type           Tight (saves overdraw on alpha sprites)
Pivot               Bottom for floor-anchored entities; Center for projectiles
Filter Mode         Point (no filter) for crisp pixel art; Bilinear for smooth art
Compression         None (pixel art) — Compression artifacts wreck pixels
Generate Mip Maps   Off for 2D
```

For HD vector-style art: keep PPU consistent; use Bilinear filter; allow ASTC/Crunch compression (mobile size).

## Sprite Atlas v2

Atlas = combine many sprites into one texture so they share a draw call.

```
Window > 2D > Sprite Atlas
- Type: Master (default) or Variant (low-res derivation)
- Include in Build: ON
- Allow Rotation / Tight Packing: tune for empty space vs runtime cost
- Object for Packing: drag folders/sprites in
```

Variants: a 0.5 scale Variant of a Master atlas → mobile gets the smaller textures, desktop the master. Toggle by build target.

`SpriteAtlasManager.atlasRequested` for late-bound atlases (Addressables-friendly).

## Sorting

Three orthogonal mechanisms, applied in this order:

1. **Sorting Layer** — broad strokes (`Background`, `World`, `Characters`, `FX`, `UI`).
2. **Order in Layer** — fine integer within a layer.
3. **Sorting Group** — wraps a parent + children so they sort as one unit (a knight + their weapon + their VFX).

**Sorting Group** is the key tool for multi-part 2D characters — without it, Z-fighting between sprite parts ruins the look.

```csharp
// Optional dynamic order based on Y (top-down RPGs)
void LateUpdate() => _renderer.sortingOrder = -(int)(transform.position.y * 100);
```

## 9-slice

For UI panels, banners, expandable decorations:

```
Sprite Editor → Border (left/right/top/bottom in pixels)
Sprite Renderer → Draw Mode = Sliced (or Tiled)
```

Drag the Sprite Renderer scale → corners stay rigid, edges stretch / tile.

## PPU consistency

Pick **one** PPU for all sprites in a level. Mixing 16 and 32 sprites in the same scene creates inconsistent pixel sizes and sub-pixel sampling artifacts.

For mixed art assets that genuinely have to coexist: use Sprite > Edit Sprite to set custom physics shapes and pivots, but keep PPU equal.

## Pixel Perfect Camera

Add `PixelPerfectCamera` component to your Camera. Settings:

```
Reference Resolution    320 × 180  (or 480 × 270, 640 × 360 — base canvas)
Assets PPU              same as your sprites
Crop Frame              Letterbox (preserves aspect, adds black bars)
                        or Stretch Fill (stretches; only for tiny variations)
Pixel Snapping          ON  (snaps every renderer to integer pixels)
Upscale Render Texture  ON for clean integer scaling
```

Without Pixel Perfect Camera you get sub-pixel jitter as the camera moves.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Mixing PPU values across sprites | Pick one PPU project-wide |
| Bilinear filter on pixel art | Set Filter Mode = Point |
| Compression on pixel art textures | None (or Crunch only after careful comparison) |
| Sprite atlas not included in build | Tick `Include in Build` |
| Sorting Layers not defined → all default | Define `Background / World / Characters / FX / UI` upfront |
| Z-fighting in multi-part character | Add Sorting Group on parent |
| Generating mipmaps on 2D | Disable mips |

## Production checklist

- [ ] Single project-wide PPU
- [ ] All gameplay sprites in a Sprite Atlas v2
- [ ] Sorting Layers + Sorting Group strategy documented
- [ ] Pixel Perfect Camera configured (if pixel art)
- [ ] Atlas Variants set up for mobile (if shipping mobile)
- [ ] Filter / Compression appropriate to art style
- [ ] No sub-pixel jitter when camera follows player
