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

## AI-assisted animation (the hard part of AI sprite gen)

Generating a single sprite is mostly solved; generating a coherent 8-frame walk cycle, 4-directional turn, or attack-with-trail animation is still where most AI tools fail. As of 2026 only one tool produces directly-usable animation end-to-end inside an Aseprite-friendly workflow.

### The current state of play

| Tool | Walk cycle | 4/8-directional | Skeleton anim | Cost | Pipeline into Unity |
|---|---|---|---|---|---|
| **PixelLab** ([pixellab.ai](https://www.pixellab.ai/)) | **Yes — best in class** | **Yes** (4/8 dir rotations from a single sprite) | **Yes** (skeleton-based + text-to-anim) | $10–50/mo | Aseprite extension → export sprite sheet → Unity Animation clip |
| **Retro Diffusion** ([astropulse.itch.io/retrodiffusion](https://astropulse.itch.io/retrodiffusion)) | No (local) | No | No | $65 one-time | Static frames only — animate manually in Spine / Unity 2D Animation |
| **Scenario.com** custom character model | Pose-consistent frames, manual sheet assembly | Via reference images | No | $30/mo (Pro) | Unity plugin → frames → assemble manually |
| **Spine + AI character** (manual rig) | N/A — you rig it | Via blend trees | **Yes** (industry standard) | Spine $69+ one-time | spine-unity package → SkeletonAnimation component |
| **AutoSprite / Spritesheets.AI / Ludo.ai** | Preset moveset only | No | No | Various | Demo-grade; hand-fix for shipping |

### Recommended workflow

**For simple multi-direction characters (top-down RPG, action)**:
- Generate full set in PixelLab → export sprite sheet → import into Unity, slice in Sprite Editor → create Animation clips (Idle / Walk / Run / Attack) per direction → Animator with float `MoveX`, `MoveY` parameters + blend tree. See "Frame-by-frame" section above for the clip mechanics.

**For metroidvania / detailed side-scroller characters**:
- Generate base character in **Retro Diffusion** (or Aseprite-painted) → import into Unity 2D Animation as multi-sprite (Mosaic ON, Character Rig ON via PSD/Aseprite Importer, see PSD Importer section) → rig bones manually in Skinning Editor → Auto Weights → animate clips by keying bone Transforms. AI handles the *art*; you handle the *rig*.

**For high-end / signature characters**:
- Train a Scenario.com character model on 10–15 reference images of the protagonist → generate every key pose / costume variant on-model → assemble sprite sheets manually → either import as multi-sprite (frame-by-frame) or rig in Spine + spine-unity for runtime skeletal animation.

### Tradeoffs at a glance

| Dimension | PixelLab | Retro Diffusion + manual rig | Scenario + Spine |
|---|---|---|---|
| Up-front cost | Subscription ongoing | One-time $65 | $30/mo + Spine $69+ |
| Animation quality | Decent → good (text-to-anim) | Excellent (you control everything) | Excellent (custom model + skeletal) |
| Cross-character consistency | Limited | Limited | **Best** (custom-trained model) |
| Offline | No (cloud) | Yes (local model) | No (cloud) |
| Time-to-first-walk-cycle | Minutes | Hours (manual rig) | Hours+ (train model first) |
| Best for | Solo dev, RPG roster | Indie with one hero character + handcraft | Studio with a roster + style sheet |

### Hybrid pipeline (most pragmatic)

Buy **Retro Diffusion Full** ($65 once) as the everyday static-asset tool, plus **one month of PixelLab** ($12) when you need a sprite sheet animation sprint. First-year total ~$77 for a full indie-grade character + tileset + animation pipeline. After year 1, only Retro Diffusion runs ($0 ongoing) unless you renew PixelLab for new animation work.

### Critical caveats

- AI walk cycles are *acceptable* for prototypes / game jams but typically need 1–3 hand-fixed frames (anticipation, hit frame, follow-through) before shipping.
- Multi-direction consistency is fragile — PixelLab's 4/8-direction rotation works best on chibi / front-facing characters; complex silhouettes (big weapons, capes, animals) often need touch-up.
- **Sprite Library + Sprite Resolver** (see section above) lets you use *one* AI-generated rig for many character variants by swapping sprites at runtime — high ROI when paired with a custom-trained Scenario model.

For the static / single-frame side of AI sprite gen (props, tiles, items, environments), see the `unity-2d-core` skill's "AI-assisted sprite pipeline" section.

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
