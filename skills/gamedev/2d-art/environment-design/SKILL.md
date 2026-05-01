---
name: gamedev-2d-art-environment-design
description: |
  Environmental art for 2D games: parallax planning (3-5 layers, depth
  distribution, scroll-speed ratios), foreground/background composition,
  atmospheric perspective via palette desaturation, silhouette
  readability, vignettes / framing, tile density vs negative space,
  environmental storytelling via tiles.

  USE WHEN: planning level art, designing parallax layers, fixing
  cluttered or unreadable scenes, telling story through environment.
allowed-tools: Read, Grep, Glob
---

# 2D Environment Design

Environment design = how the levels look BEHIND the gameplay layer.
Composition, depth, mood, storytelling.

## Parallax planning

Parallax = background layers scrolling at different speeds, simulating
depth.

### Layer count

```
3 layers:  far bg + mid bg + foreground gameplay layer (minimal, cheap)
5 layers:  sky + mountains far + mountains mid + bg props + gameplay (standard indie)
7+ layers: near sky + far sky + mountains far + mid + close hills + grass + foreground (lush)
```

Most indie 2D uses 4-5 parallax layers. Hollow Knight uses 5-7.

### Scroll speed ratios

Each layer scrolls at a fraction of camera movement:

```
Sky (most distant):     0.05x camera movement
Far mountains:          0.15x
Mid hills:              0.40x
Near props:             0.75x
Gameplay layer:         1.00x (no parallax)
Foreground decor:       1.25x (FASTER than camera, very close)
```

Foreground that scrolls FASTER than camera creates "I'm passing this"
feeling — leaves rustling, fence in front of player.

### Layer color management

Distance = atmospheric perspective. Apply progressively:

- **Far layers**: high desaturation, low contrast, hue shifted toward
  sky color (cool blue-gray for daytime).
- **Mid layers**: moderate saturation, moderate contrast.
- **Near layers**: full saturation, sharp contrast.

Stardew Valley sky → mountain → mid hills shows clear desaturation
gradient. Skip this and your scene looks flat.

### Sample palette ratios

```
Saturation ratio     Layer
20-30%               Sky / far bg
40-60%               Distant mountains
60-80%               Mid hills
80-100%              Foreground / gameplay
```

## Composition

### Silhouette readability
The **gameplay layer** (where the player + enemies live) must contrast
with bg. If bg is busy + colorful, gameplay layer might disappear.

Rules:
- **Lower bg saturation + contrast** — done via layer color management.
- **Outline gameplay sprites** distinctly.
- **Reserve color** — pick 1-2 colors used ONLY for interactive elements
  (e.g., orange for enemies, cyan for collectibles).

### Foreground framing
Foreground props (vines, foliage, machinery) frame the action without
blocking it. Use:
- **Sparse semi-transparent** vines/leaves.
- **Hard borders only at scene edges** (window frames, door arches).
- **Foreground that breaks at gameplay zones** (canopy ends where player
  walks).

### Negative space
Empty space (sky, simple terrain) gives the eye rest. Critical for
readability. Cluttered scenes overwhelm.

Rule of thumb: **30-50% of frame should be visually quiet** (sky, blank
terrain, simple gradient).

### Vignettes
Darker corners pulling attention to center. Subtle: 5-15% darkening at
corners. Aggressive: 30%+ for moody scenes.

In engines:
- Unity URP: Vignette Override on Volume.
- Custom: post-process shader applying radial gradient multiply.

## Tile density and rhythm

Avoid both:
- **All terrain** (dense): visual noise, no rest.
- **All sky** (sparse): boring.

Aim for **rhythm**: alternating dense + sparse regions. Platformer
example:
```
[ground] [sky gap] [pillar] [sky gap] [ground+enemies] [sky gap] [boss arena]
```

Sky gaps between encounters give breathing room and let players
register what just happened.

## Environmental storytelling

Tiles tell the story without text:

- **Worn paths** in grass = creatures travel here.
- **Broken architecture** = past battle, cataclysm.
- **Scorch marks** + **debris** = recent fire.
- **Vines reclaiming buildings** = abandonment, time passed.
- **Skeletons + dropped weapons** = warning, lethal area ahead.
- **Footprints disappearing into snow** = where to follow.

Place these intentionally. Don't dress an entire dungeon with worn
paths — readers will miss the meaningful ones. Apply where the story
demands attention.

## Light direction in environment

Decide **one light direction** per scene (or per time of day):
- **Sun upper-left** = morning / classic platformer.
- **Sun upper-right** = afternoon.
- **Top-down** = noon.
- **Low warm** = sunset.
- **No direct light** (overcast) = atmospheric / mysterious.

Then EVERY tile should be shaded consistently with that direction.
Inconsistent lighting between adjacent tiles = jarring.

Trick: paint the lighting pass as a separate layer for each tile, then
flatten. Bake separate "morning" and "evening" tilesets if needed.

## Mood techniques

| Mood | Techniques |
|------|-----------|
| Cozy | Warm palette, cozy lighting (lamp + soft shadow), low contrast, plants/textiles, no sharp edges |
| Tense / horror | Cool dark palette, low light, sharp edges, fog, vignette, asymmetric composition |
| Epic / heroic | Tall vertical scale, strong central composition, dramatic light + bloom, rich saturated palette |
| Mystical / dream | Soft palette, glow / haze, indistinct edges, subtle particle ambience (motes, fireflies) |
| Apocalyptic | Brown + orange + dark teal, broken architecture, dust haze, sparse vegetation |
| Underwater | Cyan dominant, ambient particle (bubbles, plankton), wavering light shafts, distortion |

## Composition rules of thumb

- **Rule of thirds**: place focal point at 1/3 line, not center.
- **Leading lines**: paths / arrows / object alignment guide eye to
  important spot.
- **Visual weight balance**: a heavy detail on left needs counter-weight
  on right (smaller object, lighter color, brighter detail).
- **Asymmetry**: pure symmetry feels static. Slight asymmetry = alive.
- **Repetition with variation**: same motif (windows, trees) in slightly
  different sizes/angles.

## Common bugs

- **All layers same saturation**: looks flat, depth gone. Apply
  desaturation gradient.
- **Foreground too busy**: blocks gameplay. Make sparse.
- **Inconsistent light direction**: tiles shaded random. Pick one
  direction, stick to it.
- **No focal point**: eye doesn't know where to look. Add a contrast
  spot (color, light, scale).
- **Parallax layers all scroll at same speed**: no depth feel.
- **Foreground scrolls SLOWER than camera**: feels like player isn't
  moving. Foreground SHOULD scroll faster.
- **Tile rhythm absent**: continuous wall of detail = exhausting.

## See also

- [tile-design/SKILL.md](../tile-design/SKILL.md)
- [palettes/SKILL.md](../palettes/SKILL.md)
- [character-design/SKILL.md](../character-design/SKILL.md) — ensure character contrasts with environment
- [lighting-art/SKILL.md](../lighting-art/SKILL.md)
- Engine: `unity-2d-cameras` (parallax via Cinemachine groups)
