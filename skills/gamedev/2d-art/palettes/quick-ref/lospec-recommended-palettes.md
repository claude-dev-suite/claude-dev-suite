# Recommended palettes (Lospec.com curated)

A curated list of widely-used restricted palettes. Lospec.com is the
de-facto repository (sortable by color count, search, download in any
format).

## Hardware-derived

### GameBoy DMG (4 greens)
Colors:
```
#0f380f  darkest
#306230
#8bac0f
#9bbc0f  lightest
```
Use case: faithful GameBoy aesthetic.

### GameBoy Pocket (4 grayscale)
Same as DMG but neutral grays.

### NES (54 unique, 4 of 64 per palette)
Hardware constraint: 4 sub-palettes of 4 each per scene. Limited to
one of 64 master colors.

### C64 (16)
Iconic Commodore 64 palette. Distinctive purple, magenta.

### MSX / EGA (16)
Pre-VGA palette.

### CGA (4 colors per mode, several modes)
Iconic teal+magenta+white "PC games of the 80s" mode 1.

## Modern indie favorites

### PICO-8 (16)
Most popular fantasy-console palette. Used everywhere in modern indie.
```
#000000 #1d2b53 #7e2553 #008751
#ab5236 #5f574f #c2c3c7 #fff1e8
#ff004d #ffa300 #ffec27 #00e436
#29adff #83769c #ff77a8 #ffccaa
```

### PICO-8 Secret Palette (32)
PICO-8 + 16 hidden alt colors. Hidden behind `poke(0x5f2e, 1)`.
Extends mood range.

### DB16 (16)
DawnBringer 16 — versatile general-purpose palette.

### DB32 (32)
Extended DawnBringer. Used by Hyper Light Drifter (loosely) and many
indies.

### Resurrect 64 (64)
Modern indie palette by Kerrie Lake. 64 colors, ramped well.

### Endesga 32 (32)
By Endesga. Vibrant, well-balanced ramps.

### Sweetie 16 (16)
GrafxKid. Cartoony, friendly. Great for kid-friendly aesthetics.

### AAP-64 (64)
adigun a. polack. Painterly pixel-art focus.

### Vinik24 (24)
Subdued, cohesive 24-color palette.

### Pear36 (36)
Indie palette with strong ramps.

### Apollo (46)
Adigun a. polack again. Great for fantasy.

## Choosing rationale

| Palette | When |
|--------|-----|
| 4-color (GB DMG) | Authentic retro, very small project, jam |
| 16-color (PICO-8 / DB16) | Modern lo-fi indie, sweet spot |
| 32-color (DB32 / Endesga 32) | Indie pixel art with rich ramping |
| 64-color (Resurrect 64 / AAP-64) | Painterly pixel art, modern style |
| 128+ | No longer "restricted" — texture-based |

## Workflow tips

1. Browse [lospec.com/palette-list](https://lospec.com/palette-list).
2. Filter by color count target.
3. Download in your tool's format (`.gpl` for GIMP/Aseprite, `.pal`,
   `.json`, `.png`).
4. In Aseprite: Edit → Convert Palette → Load Palette.
5. Pick swatches; build ramps (5-7 colors per material) from the
   palette.

## Modify, don't replace

Most teams pick a base palette but TUNE it for their project: shift
hues, replace one or two colors. The result is still cohesive (uses
ramping principles) but personalized.

## Don't reinvent the wheel

Picking 16 colors from scratch is HARD. Even pros struggle. Start with
a curated palette and modify. Lospec has decades of community
expertise distilled into the catalog.

## See also

- [hue-shift-recipes.md](hue-shift-recipes.md) — derive ramps from base palette
- Lospec.com (canonical source).
