---
name: unity-2d-lighting
description: |
  Unity 2D lighting — URP 2D Renderer, Light 2D types (Point/Freeform/Sprite/
  Parametric/Global), Shadow Casters 2D, Sprite Mask, Renderer2DData, normal
  mapped sprites, blend styles.

  USE WHEN: setting up the URP 2D Renderer, lighting a 2D scene, adding 2D
  shadows, using Sprite Mask for stencil-like effects, normal-mapped sprites.

  DO NOT USE FOR: 3D lighting (use `unity-rendering`); UI lighting concepts
  (UI doesn't normally use Light 2D); 2D animation (use `unity-2d-animation`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Lighting

## URP 2D Renderer setup

```
1. Project Settings > Graphics → URP Pipeline asset assigned.
2. Create Renderer2DData asset → assign to URP asset's Renderer List.
3. Camera component → Render Type = Base; Renderer = the 2D renderer.
```

Without the 2D Renderer assigned, Light 2D components do nothing.

## Light 2D types

| Type | What |
|---|---|
| **Global Light** | Ambient color + intensity for the entire scene (replaces clear-color lighting) |
| **Freeform** | Polygon-shaped light (room interior, lava pool) |
| **Point** | Circular falloff (torch, glow) |
| **Sprite** | Light shape derived from a sprite (any artist-defined falloff) |
| **Parametric** | N-sided polygon (legacy; prefer Freeform) |

Common setup: **one Global Light per scene** (low intensity for darkness) + **per-object Lights** to highlight key elements.

## Blend Styles

`Renderer2DData` defines up to 4 blend styles. Each has:

| Setting | Effect |
|---|---|
| Blend Mode (Multiply / Additive) | Multiply darkens unlit areas (standard); Additive brightens |
| Render Texture Scale | 0.5 = half-res light buffer (perf win, slight blur) |
| Use Depth/Stencil | Required for Shadow Casters |
| Mask Channel | Maps Sprite Renderer's Mask Interaction to specific channels |

Default blend style 0 ("Default") is enough for most projects. Add more only if you need separate light groups (e.g. "Underwater" with blue cast).

## Shadow Casters 2D

```
On a sprite that should cast shadows:
  Add ShadowCaster2D component → Self Shadows = OFF (default), Casts Shadows = ON.
  Mesh: Use Renderer Silhouette (auto from sprite) or Custom Shape.

On the Light 2D:
  Shadow Intensity > 0 → enables shadows from casters.
```

Composite Shadow Casters 2D group multiple casters with same parent transform — important for moving multi-part characters.

## Sprite Mask

Stencil-like masking — show a sprite only where another sprite is visible.

```
Sprite Mask GameObject (with SpriteMask component) defines the mask shape.
Sprite Renderer → Mask Interaction =
  None                          (default)
  Visible Inside Mask           (clipped to mask shape)
  Visible Outside Mask          (cut hole)
```

Use cases: 2D fog of war reveal, light cone visibility, transition wipes.

## Normal-mapped sprites

For dynamic 2D lighting that respects sprite geometry:

1. Author normal map (Sprite Lamp, NormalPainter, or Aseprite normal export).
2. Set the secondary texture on the sprite: Sprite Editor → Secondary Textures → name `_NormalMap`, drag normal texture.
3. Material → use the Sprite-Lit-Default shader (URP); plug `_NormalMap` if needed.
4. Light 2D → Use Normal Map = ON.

Sprites pop with bumpy 3D-looking lighting from 2D Lights. Heavy on fillrate — use sparingly.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Adding Light 2D without 2D Renderer | Configure Renderer2DData asset on the URP renderer list |
| Many overlapping point lights with Shadow Intensity 1 | Lower res for shadow buffer; combine via blend styles |
| Self Shadows ON by default | OFF unless deliberately needed (causes z-fighting on sprites) |
| Sprite Mask without `Mask Interaction` set on target | Set Mask Interaction on every sprite that should be clipped |
| Normal maps on every sprite | Only on hero/lit-emphasis sprites — fillrate cost |

## Production checklist

- [ ] Renderer2DData assigned + camera using 2D renderer
- [ ] Global Light per scene set deliberately (not default)
- [ ] Shadow Casters 2D placed on geometry that should cast
- [ ] Composite Shadow Caster on multi-part characters
- [ ] Blend styles configured if multiple light groups
- [ ] Sprite Masks tested in build (not just editor)
- [ ] Normal mapping budgeted (fillrate measured)
