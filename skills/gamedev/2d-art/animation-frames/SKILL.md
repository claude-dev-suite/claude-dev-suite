---
name: gamedev-2d-art-animation-frames
description: |
  Frame-by-frame animation for 2D games: typical frame counts (idle 2-4f
  / walk 6-8f / run 6-8f / attack 4-6f), squash/stretch limits in pixel
  art, looping cycles, sub-pixel motion problem, anticipation/impact/
  recovery beats, sprite sheet layout (Aseprite tags, TexturePacker JSON,
  Unity Sprite Editor), frame timing easing.

  USE WHEN: animating sprites, choosing frame counts, debugging "stiff"
  or "floaty" motion, organizing sprite sheets.

  DO NOT USE FOR: skeletal 2D animation (Spine/DragonBones, Unity 2D
  Animation) - different rules. See `unity-2d-animation` skill.
allowed-tools: Read, Grep, Glob
---

# Animation Frames

> **Quick refs**: [walk-cycle-keyframes.md](quick-ref/walk-cycle-keyframes.md),
> [attack-anticipation.md](quick-ref/attack-anticipation.md)

Frame-by-frame = drawing each frame. The pixel-art-classic technique.
Different from skeletal where you transform parts of the rig — see
`unity-2d-animation` for that.

## Frame count conventions

```
Animation       Frames   FPS      Total time   Notes
Idle (subtle)   2        4        500ms        Breathe, sway. Avoid 1f (static).
Idle (active)   4-6      6-8      500-1000ms   Tail wag, weapon shimmer.
Walk            6-8      10-12    600-700ms    Full gait cycle, must loop.
Run             6-8      12-15    400-550ms    Faster cadence than walk.
Sprint          4-6      15-20    250-350ms    Stretched legs, hair flow.
Jump            3-5      ad-hoc   200-400ms    Anticipation + release + air.
Attack (light)  4-6      12-15    300-450ms    Anticipation + impact + recovery.
Attack (heavy)  6-10     8-12     600-1000ms   More wind-up, slower recovery.
Damage / hit    2-4      ad-hoc   100-200ms    Brief, snappy.
Death           4-8      8-10     500-1000ms   One-shot, ends with last frame.
```

These are **rough**. Adjust to character feel: a heavy character has
slower, more weighted animation; a kid has fewer, snappier frames.

## Cadence rules

A walk cycle has **two contact frames** (foot lands) and **two passing
frames** (foot crosses below body). Full cycle = 8 keyframes ideally,
but reusable: cycle frames mirror legs left/right so 4 unique drawings
+ horizontal-mirror copies.

```
F1: contact (right foot forward)
F2: down position (knees bent, body lowest)
F3: passing (right foot under body, left ahead)
F4: up position (body highest)
F5: contact (left foot forward) - mirror of F1
F6: down position - mirror of F2
F7: passing - mirror of F3
F8: up position - mirror of F4
```

For 6-frame walks, drop F2 and F6 (compresses the down-position phase).

See [quick-ref/walk-cycle-keyframes.md](quick-ref/walk-cycle-keyframes.md)
for the canonical sequence with arm + body bob notation.

## Anticipation, impact, recovery

The 3-beat structure of any action animation:

### Anticipation (1-3 frames)
Character prepares: pulls back, crouches, draws weapon. Tells the
player "something's about to happen." Length scales with attack
power.

### Impact (1 frame, sometimes 2)
The actual hit. Single most important frame. Often paired with hitstop
(game freezes for 1-3 frames) and visual flash. Pose is most extreme.

### Recovery (1-3 frames)
Character returns to neutral. Eases back into idle. Vulnerable window in
fighting games.

Example light attack (5 frames):
```
F1: anticipation (sword raised)
F2: anticipation (weight shift forward)
F3: impact (sword extended, hit) ← hitstop trigger
F4: recovery (sword past target)
F5: recovery (returning to neutral)
```

See [quick-ref/attack-anticipation.md](quick-ref/attack-anticipation.md)
for canonical anticipation poses.

## Squash and stretch (limits in pixel art)

In animation principles, squash-and-stretch shows weight + flexibility.
In pixel art, hard-pixel constraints limit how much you can deform:

- **Subtle squash**: 1-2 pixel vertical compression on impact / landing.
  Always works.
- **Heavy squash**: 4+ pixel compression. Looks cartoony, may break
  character silhouette. Reserved for comedic / cartoon styles.
- **Stretch on jump**: 1-2 pixel vertical extension. Natural for
  athletic characters.

Avoid sub-pixel deformation (looks blurry). Use whole-pixel deform.

## Looping cycles

A loop must be **seamless**: last frame must transition naturally to
first frame.

Test: play frames F1-F8-F1-F8 manually in Aseprite (with onion skin) —
the F8 → F1 transition should feel as natural as F4 → F5.

Common bug: F8 designed as "end pose" instead of "predecessor of F1" —
loop hitches.

## Easing in frame timing

Frame timing controls the FEEL. Two approaches:

### Constant FPS
Every frame = same duration. Mechanical. OK for idle / walk.

### Eased timing (variable per frame)
Hold key poses longer, brisk through transitions. More expressive.

Example heavy attack with variable durations:
```
F1: 100ms (slow anticipation start)
F2: 80ms (committing)
F3: 250ms (HOLD on impact - emphasizes power)
F4: 60ms (snap to recovery)
F5: 150ms (settle)
```

Aseprite supports per-frame duration. Unity Animator supports curves on
sprite-swap. Engine support varies.

## Sub-pixel motion problem

A sprite at world position (10.3, 5.7) renders at integer pixel (10, 6)
on screen — but if the camera moves at 0.1 px/frame, the sprite might
shimmer between (10, 5) and (10, 6) frame-to-frame. Looks broken.

**Solutions**:
1. **Snap world positions to integer pixel** before rendering. Most
   "pixel-perfect cameras" do this.
2. **Use a higher render resolution** for pixel-perfect, render to a
   smaller texture, blit. Allows sub-pixel motion at the cost of
   half-pixel sprite locations (still cleaner than shimmer).
3. **Lock camera to integer movement** (camera teleports 1 px at a time).

Modern indie pixel art generally accepts sub-pixel but uses approach
#2 for camera + sprite anchoring.

## Sprite sheet layouts

### Aseprite tags + export
Each animation = one tag. Export as sprite sheet with:
- **Frame format**: rows or columns, padding.
- **JSON sidecar**: tag names, frame durations, slice metadata.

Unity Aseprite Importer reads the JSON natively and creates an
animation clip per tag.

### TexturePacker
Standard tool for atlasing sprite sheets:
- **Trim** transparent borders (saves space).
- **Pad** between sprites (avoids bleeding).
- **Rotate** sprites for tighter packing.
- Outputs JSON / XML / engine-specific (Unity, Godot, Phaser, Solar2D).

### Manual grid layout
Rows = animations, columns = frames. Easy to read. Wastes space if
animations have varying frame counts. Best for small projects.

### Atlas vs per-frame textures
- Atlas: one large texture, source rects per frame. Fewer draw calls,
  more cache-friendly, standard.
- Per-frame: separate texture per sprite. Easier debugging, larger
  memory footprint, OK in development.

Modern engines all use atlasing under the hood; you author per-sprite
and the import pipeline atlases.

## Common bugs

- **Stiff walk** = too few frames OR identical pose mirrored without
  weight shift.
- **Floaty jump** = no anticipation, no apex pause, no impact frame.
- **Loop hitch** = last frame doesn't transition to first.
- **Inconsistent contact frames**: foot at different position frame 1
  vs frame 5 (cycle drift). Onion skin to verify.
- **Sub-pixel shimmer**: camera or sprite at fractional pixel.
- **Drift** in cycle (sprite moves a few pixels each loop): root motion
  baked into sprite. Solution: anchor cycle around fixed point;
  movement comes from gameplay code, not animation.
- **Animation longer than gameplay window**: 6-frame attack at 60ms each
  = 360ms; if attack should be 200ms, cut to 4 frames or speed timing.

## See also

- [pixel-art-fundamentals/SKILL.md](../pixel-art-fundamentals/SKILL.md)
- [character-design/SKILL.md](../character-design/SKILL.md) — what poses to animate
- [tools/SKILL.md](../tools/SKILL.md) — Aseprite tags, TexturePacker
- Engine: `unity-2d-animation` (skeletal + frame-by-frame in Unity)
