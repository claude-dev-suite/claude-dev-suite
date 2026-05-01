# Attack anticipation poses reference

Animation principle: every action has 3 beats — anticipation, impact,
recovery. Anticipation is the "wind-up" that telegraphs the action.

## Anticipation duration

Scales with action weight:
```
Light attack:  1-2 frames (~80-120ms)
Medium attack: 2-3 frames (~120-200ms)
Heavy attack:  3-5 frames (~200-350ms)
Charged attack: 5-10+ frames (~400ms-1s)
```

Heavier attacks need more anticipation so the player can read the
threat and react.

## Anticipation pose checklist

A good anticipation pose:
- **Pulls weight back / down** (opposite of attack direction).
- **Compresses the body** (squash toward action plane).
- **Charges energy visually** (hand glow, eyes flash, particle hint).
- **Telegraphs the attack** (player can SEE which way it's coming).

## Sample anticipation poses

### Sword overhead swing (vertical chop)
```
Anticipation: sword raised high, wide stance, weight on back foot.
Impact: sword down through center, weight on front foot.
Recovery: sword past target, weight settling.
```
Anticipation in 1-2 frames; impact 1 frame (often hitstop); recovery
1-2 frames.

### Sword horizontal swing (slash)
```
Anticipation: sword pulled back to one side, body wound up.
Impact: sword crossing center-line, body uncoiling.
Recovery: sword past target side, body off-balance.
```

### Punch
```
Anticipation: fist drawn back near body, weight on back foot,
              shoulder cocked back.
Impact: arm fully extended, weight transferred forward.
Recovery: arm retracting back to neutral.
```

### Spinning kick
```
Anticipation: planted leg + arm sweeping (rotational momentum), body
              twisting.
Impact: leg sweeping through arc.
Recovery: rotation completing, foot landing.
```

### Heavy hammer
```
Anticipation: lift hammer overhead, deep crouch (weight LOW).
Impact: full slam, dust + screen shake.
Recovery: hammer at ground, slow recovery to standing.
```

### Magic spell (charged)
```
Anticipation: arms raise + glow building, particles converge to hands.
Impact: spell released — explosive frame with particles, glow peak.
Recovery: arms down, residual glow fading.
```

## Pose principles

### Squash on anticipation
Pose appears "compressed" — feet wide, knees bent, weight low. Allows
explosive release.

### Asymmetric pose
Anticipation poses are RARELY symmetric. Weight on one leg, body
twisted. Symmetric = static = un-actionable.

### Weapon visible
Player must SEE the weapon position. If anticipation hides the weapon
behind the body, player can't read it.

### Eye line / facing
Character looks at the target during anticipation. Establishes the
attack direction.

## Telegraphing severity

Players intuitively read anticipation length = attack severity:
- 1-frame anticipation: light, fast, unbuffered. Can be spammed.
- 3-frame anticipation: medium. Some commitment.
- 5+ frame anticipation: heavy. Visible commitment, dodge window.

For boss design, BIGGER anticipation = bigger payoff (and bigger
dodge window). Players learn to dodge during anticipation, not impact.

## Cancelling anticipation

Some game designs let player **cancel** during anticipation (e.g., if
distance changes, the attack fizzles).

Cancelable window: typically the first frame or two of anticipation.
After that, attack is committed.

Visual cue for cancel: fade / dissipation effect of the gathered energy.

## Charging attacks

Hold-to-charge attacks have:
```
Charge phase 1: subtle glow, soft windup
Charge phase 2: brighter glow, more particles, body trembling
Charge phase 3: max glow, ready to release
Release: massive impact frame
```

Each phase has its own "anticipation pose" sub-loop. Player feedback at
each phase boundary (sound + flash + camera shake increment).

## Common mistakes

- **No anticipation** (action starts at impact): looks "stiff", no
  weight, attack feels like teleport.
- **Anticipation pose same as idle**: action invisible.
- **Anticipation too long** for the attack power: feels sluggish,
  player suspects long stunlock window.
- **Symmetric anticipation**: looks like standing pose, no read.
- **Weapon hidden during anticipation**: player can't see attack
  direction.
- **No body weight shift**: sprite "floats" in attack — doesn't
  ground.
- **No squash on heavy hits**: hits feel weightless.

## See also

- [walk-cycle-keyframes.md](walk-cycle-keyframes.md)
- [../SKILL.md](../SKILL.md) — anticipation in context
- `vfx-2d` skill — paired hitstop and screen shake
