---
name: unity-2d-animation
description: |
  Unity 2D Animation — sprite sheet frame-by-frame, skeletal 2D animation
  (bones + skinning + IK), PSD Importer, Aseprite Importer, Sprite Library /
  Resolver for character variants.

  USE WHEN: animating characters/enemies, swapping outfits, IK for arms/legs,
  importing layered art (PSB/PSD/Aseprite), 2D rigging.

  DO NOT USE FOR: tilemap animation (use `unity-2d-tilemap` Animated Tile);
  3D character animation (use `unity-physics-anim`); UI animations (use
  `unity-input-ui`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Animation

## Two animation styles

| Style | When |
|---|---|
| **Frame-by-frame** | Distinct hand-drawn frames. Cheap, retro feel. |
| **Skeletal (bones + skinning)** | Smooth, fewer assets, easier to retarget across characters of similar rig. Use `com.unity.2d.animation`. |

You can mix: skeletal for body + sprite swap for facial expressions.

## Frame-by-frame

```
Sprite Mode = Multiple → Sprite Editor → Slice (Grid by Cell Size or Automatic)
Drag the resulting sprite sequence into Animation window → Unity creates an Animator + clip.
Loop time: ON for idle/walk; OFF for one-shots (attack hit).
Sample Rate: 12 fps for retro; 24 fps for smoother.
```

## Skeletal 2D

Required packages: `com.unity.2d.animation` + `com.unity.2d.psdimporter` (or Aseprite).

Workflow:

1. Author character with each part on its own layer in Photoshop (`.psb`) or Aseprite.
2. Import → PSD/Aseprite Importer creates a multi-sprite asset; **Mosaic** + **Character Rig** ON.
3. Open the prefab → Sprite Editor → **Skinning Editor**.
4. Add bones (root, spine, head, arm_L, arm_R, leg_L, leg_R).
5. Auto-Geometry creates mesh; Auto-Weight skins vertices to bones (review/repaint with brush as needed).
6. Drag the prefab into a scene → it has a `SpriteSkin` per part.
7. Animation window → record bone Transform changes; Animator state machine drives clips.

## IK (com.unity.2d.animation)

For arms/legs: add `Limb Solver 2D` (two-bone IK) on the IK Manager:

```
ChainSize = 2 (upper + lower arm)
Target = empty Transform you move; the limb chain follows it
```

Procedural foot placement, mouse-aim arms — both classic IK use cases.

## Sprite Library / Resolver

For runtime outfit swaps without re-skinning:

1. Create a **Sprite Library Asset** with categories (`Hair`, `Torso`, `Legs`) and labels per category.
2. On each body part GameObject, replace `SpriteRenderer.sprite` with **SpriteResolver** referencing a category+label.
3. At runtime, change `SpriteResolver.SetCategoryAndLabel(category, label)` → swaps sprite without losing skinning.

## PSD Importer

Settings to know:

```
Texture Type      Sprite (2D and UI)
Sprite Mode       Multiple
Mosaic            ON   (packs each layer into the atlas)
Character Rig     ON   (creates a bone-rigged prefab)
Use Layer Group   ON   (preserves PSD group structure as bone hierarchy)
PPU               match project-wide PPU
```

Re-import after a PSD edit → bones + sprites stay in sync; skin weights are preserved.

## Aseprite Importer

Same idea but native Aseprite (`.ase`/`.aseprite`) workflow — preserves layer groups, pivots, and **animation tags** (importing as separate AnimationClips automatically).

Use `.aseprite` for pixel-art characters; `.psb` for hi-res / hand-drawn.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Re-importing a PSD that overwrites manual weights | Use **Skinning Editor** → save weights with the asset; PSD Importer preserves on re-import as long as part identifiers don't change |
| One animator per body part | Single `Animator` on the root + Animation clips that key bone transforms |
| Not using Sprite Library for outfit variations | Use SpriteResolver — keeps the rig untouched |
| Ignoring import PPU mismatch | Match PSD/Aseprite PPU to project-wide PPU |
| Frame-by-frame animations huge in atlas | Variant atlases per character |

## Production checklist

- [ ] PPU consistent across PSDs/Aseprite imports
- [ ] Character rig auto-created via PSD Importer (Mosaic + Character Rig)
- [ ] Skin weights reviewed at deformation joints (shoulders, hips)
- [ ] IK used for limbs that need targeting
- [ ] Sprite Library + Resolver for variant systems (skins, outfits)
- [ ] Animation events (`AnimationEvent`) used for hit frames, footsteps
