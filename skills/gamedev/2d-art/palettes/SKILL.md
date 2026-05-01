---
name: gamedev-2d-art-palettes
description: |
  Color palettes for 2D games: color theory practical (warm/cool,
  complementary, analogous), restricted palettes ready-made (PICO-8,
  GameBoy DMG, DB16, DB32, AAP-64, NES, C64), hue shifting (warm-cool
  ramps), palette swaps for character variants and time-of-day, indexed
  mode workflow, .gpl/.pal/.ase/.json export.

  USE WHEN: starting a project's palette, choosing restricted palette,
  designing color ramps for shading, planning palette swaps.
allowed-tools: Read, Grep, Glob
---

# Color Palettes for 2D Games

> **Quick refs**: [lospec-recommended-palettes.md](quick-ref/lospec-recommended-palettes.md),
> [hue-shift-recipes.md](quick-ref/hue-shift-recipes.md)

A pixel art project benefits from a **restricted palette**: limits creativity productively, ensures cohesion, eases palette swaps for character / time-of-day / status variants.

## Color theory cheat sheet

Practical rules for game art (not academic):

- **Complementary**: opposite on color wheel (red / cyan). High contrast,
  draws focus. Use for hero vs background, key UI elements.
- **Analogous**: adjacent on wheel (orange + yellow + red). Cohesive,
  natural. Use for environment palettes.
- **Triadic**: 3 evenly spaced (red / yellow / blue). Vibrant, balanced,
  classic cartoon look.
- **Split-complementary**: base + 2 colors adjacent to its complement.
  More forgiving than full complementary.

Mood mapping (rough):

| Mood | Palette feel |
|------|-------------|
| Cheerful, kid-friendly | Saturated triadic, warm dominant |
| Tense, horror | Desaturated, dark, narrow hue range |
| Mystical / magical | Analogous purples + blues with neon accents |
| Apocalyptic | Brown + orange + dark teal (Mad Max look) |
| Underwater | Cyan + teal + green dominant, warm accents on creatures |

## Restricted palettes (recommended starts)

| Palette | Colors | Source | Use case |
|---------|--------|--------|---------|
| **GameBoy DMG** | 4 (greens) | Hardware | Authentic GB look |
| **PICO-8** | 16 | Lexaloffle fantasy console | Modern lo-fi indie |
| **PICO-8 secret** | +16 (32 total) | Hidden in PICO-8 | Extended lo-fi |
| **DB16** | 16 | DawnBringer (Dan Hascome) | Versatile general use |
| **DB32** | 32 | DawnBringer | Stardew / Hyper Light Drifter style |
| **AAP-64** | 64 | adigun a. polack | Painterly pixel art |
| **NES** | 54 | Hardware (4 sub-palettes of 4) | Authentic NES |
| **C64** | 16 | Hardware | Authentic C64 |
| **MS-DOS / EGA** | 16 | IBM EGA hardware | DOS-era games |
| **Resurrect 64** | 64 | Kerrie Lake | Modern indie |
| **Sweetie 16** | 16 | GrafxKid | Friendly cartoony |

**Lospec.com** = the de-facto repository. Sortable by color count,
search keyword, download in any format.

## Color count tradeoffs

- **4-8 colors**: GameBoy / Atari look. Forces strong silhouettes.
  Animation cheap.
- **16 colors**: PICO-8 / DB16. Sweet spot for indie. Rich enough for
  shading + outlines + accent colors.
- **32-64 colors**: AAP-64 / DB32. Modern pixel art. Allows hue shifting
  without running out of slots.
- **128+ colors**: Painterly territory. No longer "restricted palette" —
  becomes texture-based art.

**Most modern indie pixel art** uses 32-48 colors total project-wide,
with sub-palettes of ~16 per scene/character.

## Hue shifting (the key technique)

Naive shading: take base color, decrease lightness for shadow, increase
for highlight (RGB straight-line).

```
shadow      base       highlight
#3a3a3a → #6e6e6e → #aaaaaa   (gray ramp - boring)
```

Hue shifting: rotate hue toward **cool** (blue/purple) for shadow,
toward **warm** (yellow/orange) for highlight. Result feels alive.

```
shadow      base       highlight
#3a3a6e → #5e6e6e → #aaaa6e   (subtle hue shift in shading ramp)
```

See [quick-ref/hue-shift-recipes.md](quick-ref/hue-shift-recipes.md) for
canonical ramps (skin, foliage, stone, water).

**Rule of thumb**: shadow side hue rotates toward dominant
ambient/sky color (often cool blue), highlight side toward warm
(sunlight orange).

## Color ramps

A "ramp" = ordered list of N colors used for one material's shading.
Typical ramp length: 4-7 colors.

```
Foliage ramp (5 colors):
#1a3a18 → #2e5a2a → #4a7a3e → #7a9a52 → #aabd6a
darkest    shadow    base       lit       highlight

Stone ramp (5 colors, hue-shifted):
#2a2638 → #4a4252 → #6c6276 → #8e8896 → #b0b0b0

Skin ramp (warm bias):
#5a3232 → #8a5050 → #b87878 → #d8a070 → #f0c898

Water ramp (cool bias):
#1a2a4a → #2e4a76 → #5278a8 → #88a8d0 → #b8d8f0
```

Reuse a ramp across multiple objects of the same material → cohesion.

## Palette swap conventions

Replace the palette without redrawing the sprite. Used for:

- **Character variants** (red / blue / green hero in same outfit).
- **Faction colors** (good guys orange, enemies purple).
- **Status effects** (poisoned = purple tint, frozen = cyan tint).
- **Time of day** (day → dusk → night palette swap on the entire scene).
- **Damage flash** (full white palette for 2 frames on hit).

Two implementation strategies:

### 1. Indexed mode (Aseprite + engine support)
Sprite stored as palette indices, engine looks up colors at render time.
Trivial swap: change palette LUT.
- Aseprite: Mode → Indexed.
- Unity: requires custom shader sampling palette texture.
- Godot: built-in via shader `texture(palette, vec2(index, 0.5))`.

### 2. Color replacement shader
Sprite stored RGB, shader detects "base color N" → outputs "swap color N".
Works in any engine. Supports up to 8-16 colors (limited by shader
uniforms).

## Day / night palette shifts

Sample workflow:

1. Author the **day palette** as default.
2. Define a **night palette mapping**: each day color → corresponding
   night color (usually cooler + darker + slight purple tint).
3. Engine fades between palettes over X seconds at sunset/sunrise.
4. Optionally: emissive sprites (street lamps, fireflies) bypass the
   palette swap (always lit color).

## File formats

- **`.gpl`** (GIMP) — text format, widely supported.
- **`.ase` / `.aseprite`** — Aseprite native (binary).
- **`.pal`** (JASC / Microsoft) — text RGB list.
- **`.json`** — Lospec / custom (RGB array).
- **`.hex`** — Lospec text export, just hex codes one per line.
- **`.png`** — strip image (1px tall), sampled by engine.

Aseprite's **Edit → Convert Palette → Save Palette** exports any
combination.

## Common mistakes

- **Too many colors**: 200+ colors = painted, not pixel art. Restrict.
- **Not reusing ramps**: every object has its own colors → no cohesion.
- **Pure value gradient (no hue shift)**: looks dead.
- **Mid-tone gap**: ramp jumps from 30% → 70% lightness with no 50%
  → banding. Fix: paint mid-tones.
- **Outline always pure black**: looks heavy / cartoony. Use very dark
  variant of fill color instead.
- **Saturation crushed in shadows**: shadows shouldn't go gray; keep
  some chroma.
- **Over-saturated palette**: looks cheap. Pull saturation back ~80% from
  picker max.

## See also

- [pixel-art-fundamentals/SKILL.md](../pixel-art-fundamentals/SKILL.md)
- [lighting-art/SKILL.md](../lighting-art/SKILL.md)
- [tools/SKILL.md](../tools/SKILL.md) — Aseprite indexed-mode workflow
