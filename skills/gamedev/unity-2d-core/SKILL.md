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

## AI-assisted sprite pipeline (Aseprite-native tools)

For static sprites (props, items, environments, tiles) AI generators are productive. **No AI tool today produces ship-ready output zero-touch** — every sprite needs an Aseprite cleanup pass before importing into Unity.

### Tools that install as Aseprite extensions

| Tool | Cost | Model | Output license | Offline |
|---|---|---|---|---|
| **Retro Diffusion Full** ([astropulse.itch.io/retrodiffusion](https://astropulse.itch.io/retrodiffusion)) | $65 one-time | Local pixel-art SD (Nvidia GTX 1050 Ti+ or Mac M1+) | Yours, commercial OK | Yes |
| **PixelLab** ([pixellab.ai](https://www.pixellab.ai/)) | $10–50/mo | Cloud (zero hardware) | Yours, commercial OK (no model-training on outputs) | No |
| **PixelAI** ([red335.itch.io/pixelai-local-ai-directly-in-aseprite](https://red335.itch.io/pixelai-local-ai-directly-in-aseprite)) | Free / pay-what-you-want | Local SD (auto-download, Windows + Nvidia recommended) | Yours, commercial OK | Yes |
| **Retro Diffusion Lite** | $20+ one-time | Local pixel-art SD | Yours, commercial OK | Yes |

All four install via `Edit > Preferences > Extensions > Add Extension` and expose AI panels inside the Aseprite UI.

### License pitfalls (avoid for shipping)

- **Leonardo.ai free tier** — Leonardo retains rights to your outputs. Paid only for full ownership.
- **Recraft free tier** — outputs owned by Recraft, made public in gallery.
- **Scenario.com free tier** — "personal/evaluation only", do not ship.
- **Midjourney / DALL-E / Recraft** — produce *anti-aliased "pixel-styled"* output, not crisp pixels. Need 8× nearest-neighbour downscale + palette quantise to be usable as sprites.

### Mandatory cleanup before Unity import

1. **Spritefusion Pixel Snapper** ([spritefusion.com/pixel-snapper](https://www.spritefusion.com/pixel-snapper)) — free Rust CLI that snaps off-grid pixels back onto integer coordinates and quantises the palette. Run on every AI-generated sprite before opening in Aseprite.
2. **Aseprite touch-up** — palette unification, edge cleanup, transparency. Even Retro Diffusion / PixelLab outputs benefit from a quick pass.
3. **Unity import settings** (set on the asset, not in code):
   ```
   Texture Type        Sprite (2D and UI)
   Pixels Per Unit     match project-wide PPU (see "PPU consistency" section)
   Filter Mode         Point  (no filter)        — anti-aliasing ruins pixel art
   Compression         None                       — JPEG-style compression destroys palette
   Generate Mip Maps   OFF                        — 2D doesn't need mips
   Wrap Mode           Clamp (or Repeat for tileable backgrounds)
   ```

### Decision tree (what to use when)

| Need | Pick |
|---|---|
| One-off props / items / icons / environments | **Retro Diffusion Full** ($65 once) — best ROI, offline, IP-clean |
| No budget / Windows + Nvidia | **PixelAI** (free) |
| Tilesets (47-tile autotile, rule-tile-ready) | **PixelLab tileset gen** OR Retro Diffusion + Aseprite cleanup |
| Hi-res concept / mood board (then trace by hand) | Midjourney / Flux / DALL-E (NOT for direct sprite output) |
| Full-control free + self-hosted (no SaaS) | ComfyUI + Pixel Art XL LoRA + 8× nearest-neighbour downscale + Pixel Snapper |
| Studio-grade "same character, every variant" consistency | Scenario.com Pro custom-trained character model ($30/mo) |

For animation-specific AI tools (walk cycles, 4/8-directional sprites), see the `unity-2d-animation` skill — it's a different problem.

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
