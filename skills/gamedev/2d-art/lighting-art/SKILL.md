---
name: gamedev-2d-art-lighting-art
description: |
  Painting 2D art for dynamic lighting: workflow for Unity 2D Lights /
  Godot CanvasLight, normal map authoring (Sprite Lamp / hand-painted),
  separation in layers (diffuse / normal / emissive / mask), self-
  shadowing in pixel art, day/night palette swaps vs realtime light
  mixing, glow / emissive layers.

  USE WHEN: integrating 2D Lights with hand-painted sprites, deciding
  baked vs dynamic lighting, painting normal maps for pixel art.
allowed-tools: Read, Grep, Glob
---

# 2D Lighting (Art Side)

Two paradigms for 2D lighting:

1. **Baked into the sprite** (classic). Highlights and shadows painted
   directly. Fast, predictable, locks the lighting direction.
2. **Dynamic (engine 2D Lights)**. Sprite is "neutral" diffuse, engine
   computes lighting from scene lights at runtime. Allows day/night
   shifts, point lights, dynamic shadows.

Modern indie pixel art usually combines both: baked rim light + dynamic
fill from scene Lights.

## Engine systems

| Engine | 2D lighting system |
|--------|-------------------|
| **Unity URP 2D** | `2D Renderer Data` + `Light 2D` components (Point/Sprite/Freeform/Parametric/Global). Normal map secondary texture. Shadow Caster 2D for occlusion. |
| **Godot 4** | `PointLight2D` / `DirectionalLight2D` + `LightOccluder2D` for shadows. Normal map via shader. |
| **Defold** | Custom shaders. |
| **Phaser / web** | Pixi.js light filter or custom shader. |

## Sprite layer separation for dynamic lighting

A "lit-aware" sprite needs (at minimum):

1. **Diffuse / albedo**: the base color. Drawn flat, no baked shadows.
2. **Normal map**: surface direction encoded in RGB. (See
   `seamless-textures/SKILL.md` for authoring.)
3. **(Optional) Emissive / glow mask**: pixels that should ignore
   lighting and stay bright (street lamps, lava, magic). RGB =
   emission color, alpha = mask.
4. **(Optional) Specular / smoothness**: where light reflects.
5. **(Optional) Self-shadow / occlusion**: which surfaces of the sprite
   shadow other surfaces of the sprite. Rare in pixel art.

Most pixel-art games stop at diffuse + normal + emissive. Adding more
is diminishing returns vs hand-painting.

## Painting flat diffuse for dynamic lighting

If you'll use 2D Lights, the diffuse should be **flat-lit** — single
ambient lighting condition, no strong shadow side. The engine adds
the directional shading.

Typical workflow:
1. Paint with **uniform mid-tone shading** (no strong light direction).
2. Add **ambient occlusion** (where surfaces meet — under hat brim,
   under chin, in joints).
3. Don't paint a strong rim/highlight; engine will do it.

If you instead want classic **fully-shaded diffuse**, the engine's 2D
Light affects it ON TOP of the bake — works but the result is
double-shaded (cool effect for dramatic lighting; bad for naturalistic).

## Normal map workflow

See `seamless-textures/SKILL.md` for normal map authoring options
(Sprite Lamp, Sprite DLight, Materialize, hand-paint).

For pixel art: normals on small sprites can look strange because
neighboring pixels have different normals → light shifts pixel-by-pixel
unevenly. Solutions:

- **Smooth normals**: blur the normal map slightly so light transitions
  smoothly across small sprites. Loses some surface detail but feels
  more cohesive.
- **Hand-paint flat regions**: large flat surfaces of a character (chest,
  back) should have uniform normal (#8080FF), not noisy.
- **Strong normals only at silhouette**: where the form turns away
  from camera, use stronger Z-component variation; flat interior keeps
  uniform.

## Self-shadowing in pixel art

Real-time self-shadow on a pixel sprite is usually **not worth it**.
Dynamic shadows on a 32×32 character look noisy, low-resolution, jittery
as the light moves.

Common approaches:

### Bake self-shadow into diffuse
The cheap way. Paint the sprite with shadow side darker (lit assumed
from upper-left). Limits dynamic lighting (always upper-left feel) but
looks sharp.

### Use separate top-light and rim-light layers
Author two diffuse variants: top-lit and rim-lit. Engine blends based
on light direction. Doubles art cost but feels alive.

### Skip self-shadow, rely on directional fill
Flat-painted diffuse + 2D Light gives a soft directional fill. Sprite
doesn't really self-shadow, but the rim-light hint feels lit. Works for
most indie pixel art.

## Emissive / glow

Emissive pixels ignore lighting and stay full-bright. Use cases:
- Street lamps, candles, fireflies, eyes glowing in dark.
- Magic spells, neon signs, lava, screens.
- HUD elements.

Authoring:
- Paint emissive layer in Aseprite (separate layer named "emissive").
- Export as separate texture OR RGBA where alpha = emissive mask.
- Engine shader: `final_color = lit_color + emissive_color * emissive_mask`.

In Unity URP 2D: assign emissive secondary texture in Sprite Renderer.

## Day / night palette swap vs realtime mixing

### Palette swap approach
- One palette per time-of-day (day, dusk, night, dawn).
- Engine fades between palettes over X seconds.
- Pros: total artist control, retro look.
- Cons: doesn't react to dynamic lights (torches stay torch-bright at
  noon and night).

### Realtime light mixing
- One neutral / day diffuse.
- Multiple Lights with color tint:
  - Global Light 2D = sun (warm noon, cool night).
  - Point Lights = torches (warm, flicker).
- Pros: dynamic, torches naturally bloom in night, dynamic shadows.
- Cons: can look "modern" vs intended retro feel.

### Hybrid (most modern indie)
- Authored ramp shifts per time of day (day uses warm ramp, night
  uses cool ramp).
- Plus Global Light 2D color tint.
- Plus emissive lights for explicit glow sources.

Stardew Valley uses palette swap (retro fit). Hyper Light Drifter uses
realtime. Hollow Knight uses realtime + heavy emissive.

## Glow / bloom

Two ways to achieve "glow":

1. **Pre-baked glow halo**: paint a halo around emissive pixels. No
   shader needed. Cheaper but static.
2. **Post-process bloom**: extract bright pixels, blur, add back.
   Looks dynamic, requires post-process pass (URP volume Bloom override
   in Unity, post-process shader in Godot).

For pixel art: option 2 conflicts with the pixel-perfect aesthetic
(blur softens pixels). Common compromise: enable bloom only on
emissive layer, not on the diffuse.

## Common bugs

- **Double-shaded sprites**: fully baked diffuse + dynamic light =
  shadow stacks. Solution: paint flat diffuse OR flat rim, not both.
- **Normal map green channel inverted**: light comes from "wrong"
  direction. Toggle Y-flip in Sprite Renderer / shader.
- **Emissive layer also gets lit**: forgot to mask out lighting on
  emissive. Solution: emissive added AFTER lighting, not multiplied.
- **Bloom blurs pixels**: pixel art aesthetic broken. Limit bloom to
  emissive mask only.
- **Pixel-by-pixel normal noise**: sprite looks "wrong" under light.
  Smooth the normal map.

## See also

- [seamless-textures/SKILL.md](../seamless-textures/SKILL.md) — normal map authoring
- [palettes/SKILL.md](../palettes/SKILL.md) — palette swap vs realtime
- [vfx-2d/SKILL.md](../vfx-2d/SKILL.md) — emissive vfx
- Engine: `unity-2d-lighting`
