---
name: gamedev-2d-art-vfx-2d
description: |
  Visual effects in 2D: frame patterns for smoke / fire / water / electricity,
  hitstop and hit pause, screen shake intensity curves, particle frames vs
  procedural particles, juice principles (Vlambeer "Art of Screenshake"),
  trail effects, color flash, debris, decals.

  USE WHEN: authoring effect sprites, deciding pre-baked vs procedural
  particles, designing impact / juice for actions.
allowed-tools: Read, Grep, Glob
---

# 2D VFX (Visual Effects)

VFX = the small effects that make actions feel impactful: hit flashes,
explosion frames, smoke puffs, screen shake. The "juice" of game feel.

Reference: **Vlambeer's "The Art of Screenshake"** (talk by Jan
Willem Nijman, 2013) — the canonical breakdown of game-feel techniques.
Every indie should watch.

## Canonical effect frame counts

```
Effect              Frames   FPS    Total      Notes
Smoke puff          6-8      8-12   600-700ms  Expand → drift → fade
Fire (loop)         4-6      8-10   400-500ms  Turbulent loop, no hard end
Water splash        5-7      ad-hoc 200-400ms  Impact + arc + settle
Electricity         2-3      24-30  60-100ms   Fast jitter, looping
Sparks              3-5      30-60  50-150ms   Quick, small
Sword swing trail   3-4      24+    100-150ms  One-shot, fades quick
Damage flash        2-3      ad-hoc 60-120ms   Stuck on hit moment
Explosion           8-12     8-15   500-1000ms Bright peak, smoke residual
Heal / buff burst   6-8      8-12   500-700ms  Soft expand
Power-up pickup     8-10     12-15  500-700ms  Sparkle + shimmer
```

## Smoke

Canonical 6-frame smoke puff:
```
F1: small dark cloud (initial)
F2: expanded, lighter
F3: maximum size, mid-tone
F4: drifting up, fading
F5: thin, mostly dispersed
F6: barely visible, last wisp
```

Color: starts dark (impact dust), goes lighter (warm air), ends near
sky color. Use 3-color palette ramp.

For LOOPING smoke (chimney): 4-6 frame loop, drift up offset by 1-2 px
per frame, opacity stays roughly constant.

## Fire

Looping fire is **noisy and turbulent**. Hard to make periodic without
visible repetition. Tricks:

- **Long loop** (6+ frames) with subtle frame-to-frame change.
- **Multiple flame sprites** at slight offsets, layered.
- **Vertical scroll** of internal flame "noise" texture (shader trick).

Color ramp for fire:
- Base = dark red (#3a0a00).
- Mid = orange (#d04a00).
- Top = yellow (#fae670).
- Smoke trail above = gray (#666).

Cooler for magical fire: cyan core + purple outer.

## Water splash

Splash on impact:
```
F1: vertical jet (water displaced upward)
F2: peak height, droplets separating
F3: droplets in arc, base ring forming
F4: droplets falling back, ring expanding
F5: most water settled, ripple ring
F6: ripple fading
```

Water palette: blue ramp + white highlights at impact peak.

Looping water (puddle ripple, river): 3-4 frame loop with shifted
highlight pattern. Subtle.

## Electricity

Electric/lightning bolts: **2-3 frames**, played FAST (24-30 fps), jitter
between similar shapes. The eye sees "alive electricity" rather than
discrete frames.

Tricks:
- 3 frame loop with slightly different bolt shape each frame.
- Intentional asymmetry — never mirror perfectly.
- Use yellow + cyan + white for color contrast.
- Add subtle glow halo (semi-transparent yellow circle behind bolt).

Continuous beam: same approach but bolt path is a steady curve, jitter
is in branches.

## Hitstop / hit pause

Brief game-time freeze on hit. Critical for game feel.

```
Light hit:    1-2 frames freeze (~16-33ms)
Medium hit:   3-5 frames (~50-80ms)
Heavy hit:    6-10 frames (~100-167ms)
Crit / parry: 8-15 frames (~133-250ms) + visual flourish
```

During freeze:
- All gameplay paused (player can still move? OPTIONAL — usually no).
- Particle effects continue (smoke, sparks).
- Screen shake fires.
- Color flash on hit sprite (full white or palette flash).

Implementation: `Time.timeScale = 0.05` for X frames in Unity, or
manual game-state pause flag. Don't actually `Time.timeScale = 0` —
breaks animation timing on resume.

## Screen shake

Random offset to camera position over short duration.

### Intensity curves
- **Linear decay**: `intensity * (1 - t / duration)`. OK but mechanical.
- **Quadratic decay**: `intensity * (1 - t / duration)^2`. Snappier.
- **Bounce**: oscillating, decaying envelope.

### Shake parameters
- **Magnitude**: pixels of offset. 1-3 px = subtle hit, 4-8 px = explosion,
  10+ px = boss / earthquake.
- **Frequency**: shakes per second. 30+ Hz feels chaotic, 15 Hz feels
  rhythmic.
- **Duration**: 100-300ms typical for hits, 500-1000ms for explosions.

### Direction
- **Random 2D**: omni-directional shake.
- **Directional** (along hit normal): more grounded, shows attack
  direction.

Cinemachine 2D in Unity has built-in Impulse system. Cinemachine Impulse
Source on the trigger, listener on the camera, takes care of decay
+ multiple sources.

## Color flash

Sprite turns full white (or another color) for 1-3 frames on hit.
Communicates "I got hit" without animation work.

Implementation: shader uniform `_FlashColor` with alpha 0..1. Lerp from
white (1) to no-flash (0) over the flash duration.

## Trail effects

For sword swings, projectiles, dashing:

### Pre-baked trail sprite
1-frame curved line drawn through the swing arc. Cheap, looks consistent.

### Frame-stripe trail
Stack semi-transparent copies of the sprite at offset positions over the
last N frames. Engine-side. Looks dynamic, pixel-perfect difficult.

### Shader ribbon
Procedural geometry along the swing path. More common in higher-res 2D.

## Particles (procedural)

When pre-baked frames don't suffice (large numbers, varied behavior):

- **Unity Particle System** (yes, works for 2D — set Renderer module
  to Sprite, set Y-axis billboard).
- **Godot CPUParticles2D / GPUParticles2D**.
- Custom sprite-pool emitter.

Procedural is right for:
- **Many small particles** (debris, dust, splatter).
- **Variable lifetime / spawn count** (heal sparkles, depending on amount
  healed).
- **Physics-driven** (debris bouncing on terrain).

Pre-baked is right for:
- **Distinctive shapes** (specific spell effect).
- **Tightly choreographed** (boss attack with exact pattern).

## Decals / aftermath

Persistent marks: scorch marks, blood splatters, footprints, cracks.

- Spawn as sprite at hit location.
- Random rotation + small scale variance.
- Optional fade over N seconds OR persist until scene cleanup.
- Limit total count (object pool, oldest fades first).

## Juice principles ("Art of Screenshake" summary)

For every meaningful action, layer:
1. **Squash-stretch** on sprite (subtle pixel deform).
2. **Hitstop** on impact.
3. **Color flash** on the affected sprite.
4. **Particle burst** at impact.
5. **Screen shake** scaled to action weight.
6. **Sound** with attack envelope (omitted in art skill, but listed
   for completeness).
7. **Trail** if motion has direction.
8. **Decal** if persistent.

Subtle layering of all = "juicy" feel. Single technique applied = falls
flat. Test by toggling each layer off and feeling the loss.

## Common bugs

- **Particles in pixel art at non-integer positions**: shimmer / blur.
  Solution: snap particle positions to integer.
- **Hitstop too long**: feels frozen, not impactful. Tune to ≤80ms for
  light, ≤160ms heavy.
- **Screen shake too aggressive**: nausea-inducing. Magnitude < 8 px
  typical.
- **No color flash on hit**: hits feel unregistered.
- **Smoke puff endless**: forgot the fade-out frames. End on alpha=0.
- **Fire loop visibly periodic**: extend loop length, vary frames more.

## See also

- [animation-frames/SKILL.md](../animation-frames/SKILL.md) — anticipation/impact/recovery
- [pixel-art-fundamentals/SKILL.md](../pixel-art-fundamentals/SKILL.md) — keep VFX pixel-disciplined
- [lighting-art/SKILL.md](../lighting-art/SKILL.md) — emissive on glow effects
- Engine: `unity-2d-gameplay` (juice patterns), `unity-2d-cameras` (Cinemachine Impulse)
