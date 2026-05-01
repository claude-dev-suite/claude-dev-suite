# Walk cycle keyframes reference

The 8-frame walk cycle is canonical. Each frame is named for what it
shows.

## 8-frame canonical cycle

```
F1: Contact (right foot lands forward)
F2: Down (lowest body position, recoil from impact)
F3: Passing (legs cross under body, foot lifts)
F4: Up (highest body position, light moment)
F5: Contact (left foot lands forward) — mirror of F1
F6: Down (mirror of F2)
F7: Passing (mirror of F3)
F8: Up (mirror of F4)
```

Loop: F8 → F1 must transition naturally.

## Body bob (vertical Y movement)

```
Frame:   1   2   3   4   5   6   7   8
Y bob:  +0  -1  +0  +1  +0  -1  +0  +1
```
Y goes: contact (0), down (lowest), passing (0), up (highest), repeat.
Heavy character: 2 px bob. Light: 1 px bob. Stealthy: 0 bob.

## Arm swing

Arms swing **opposite to legs** (right arm forward when left foot
forward):
```
Frame:    1     2     3     4     5     6     7     8
Right arm: bk    bk    fwd   fwd   fwd   fwd   bk    bk
Left arm:  fwd   fwd   bk    bk    bk    bk    fwd   fwd
```

For low-arm-swing (sneaky / stealthy character): keep arms close to
body, only 1-2 px swing.

For energetic / running character: pronounced swing, 4-6 px.

## Per-character feel adjustments

### Heavy character (large hero, knight, golem)
- 8-frame cycle ideally.
- Body bob: 2-3 px.
- Slow tempo: 12-15 fps (per frame ~80 ms).
- Wide stance, pronounced contact.
- Arm swing low and tight.

### Light character (kid, dancer, sprite)
- 6-frame cycle (drop F2 / F6).
- Body bob: 1-2 px.
- Fast tempo: 8-10 fps (per frame 100-125 ms).
- Springy step, knees high in passing position.
- Arm swing energetic.

### Sneaky / stealth character (rogue, thief)
- 6-8 frame cycle.
- Body bob: 0-1 px (low profile).
- Slow tempo: 14-16 fps (sneaking is slow).
- Knees bent throughout, feet roll heel-toe.
- Arms close to body.

### Confident strut (boss, captain)
- 8 frames.
- Body bob: 1-2 px + slight horizontal sway.
- Long stride.
- Shoulders pulled back.
- Arm swing wide, hands relaxed.

## Mirroring shortcut

If the character is roughly symmetric left/right, you can author 4
frames (F1-F4) and mirror horizontally for F5-F8. Saves 50% work.

Trade-off: looks symmetric. For asymmetric characters (sword on right
hip, satchel on left) you must author all 8.

## Easing

By default each frame has same duration. For more "weight":

```
F1: 100ms (contact, hold briefly)
F2: 70ms  (down, brisk)
F3: 80ms  (passing)
F4: 70ms  (up, brisk)
F5-F8: same as F1-F4
```

Aseprite supports per-frame duration in the timeline.

## Onion skin verification

In Aseprite:
- View → Onion Skin → Show.
- Cycle through F1-F8 with onion skin: each frame should show natural
  evolution from previous.
- Specifically check: F8 → F1 transition (loop boundary).

## Test loop

In Aseprite:
- Loop animation in preview window.
- Watch for hitches (where loop doesn't flow), drift (sprite walks
  off origin), or stiffness (arms not swinging naturally).

## Common mistakes

- **No down/up bob** = robotic walk. Always bob the body.
- **Both feet contact same frame** = standing pose, not walking.
- **Arms in same direction as legs** = looks like running on a
  treadmill. Opposite arm/leg.
- **Drift** (sprite moves a few pixels each loop): root motion baked
  into sprite. Anchor cycle around fixed point; movement comes
  from gameplay code.
- **F1 and F5 not mirror-equivalent**: cycle asymmetric, looks broken.
- **Loop hitch**: F8 → F1 visibly jerks. Verify with onion skin.
- **Too few frames for character size**: 32×32 hero with 4-frame walk
  feels low-detail. Use at least 6 for medium sprites.

## Reference: the contact frame

Contact frame is the BEST single frame to test character feel. Pick
one moment of impact (foot landing) and judge:
- Is weight distributed correctly? (back leg pushing, front leg
  bearing weight)
- Is the body fully transmitting weight? (slight crouch on contact)
- Are the arms in opposite swing positions?
- Does the silhouette LOOK like walking, not standing?

If the contact frame works, the rest follows.
