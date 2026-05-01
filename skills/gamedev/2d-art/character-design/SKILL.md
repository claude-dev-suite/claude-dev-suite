---
name: gamedev-2d-art-character-design
description: |
  Character design for 2D games: silhouette-first methodology, character-
  to-tile size ratio, expressions in low resolution (eye / mouth pixel
  placement), anatomy shortcuts in pixel art, faction/role visual
  language (silhouette + palette identifying class), walk cycle
  conveying weight and attitude.

  USE WHEN: designing a new character, fixing unreadable / cluttered
  characters, distinguishing factions visually, assessing animation
  weight.
allowed-tools: Read, Grep, Glob
---

# 2D Character Design

Character design in pixel art = silhouette + palette + a few decisive
pixels. At small resolutions, every pixel matters.

## Silhouette first

Black-out the character and judge readability. If the silhouette tells
the story, the rest is detail.

### Silhouette test
1. Fill character sprite with pure black on transparent bg.
2. Place at intended in-game scale (no zoom).
3. Question: can I tell what / who this is in 0.5 seconds?

If no, the silhouette is wrong. No amount of detail will fix it.

### Silhouette principles
- **Distinctive shape**: avoid generic blob. Add a hat, weapon, cape,
  long ears — something readable.
- **Asymmetric details**: weapon on one side, satchel on other →
  different left/right silhouette → readable orientation.
- **Negative space**: gap between arms and torso, between legs.
  Adds shape variation. Avoid solid blocks.
- **Limb articulation**: separated limbs vs blob body show animation
  potential.

### Comparison: bad vs good
Generic humanoid blob → unreadable.
Silhouette with: tall hat + cape + sword pointing right → instantly
"warrior".

## Character-to-tile size ratio

Match character size to gameplay needs:

```
Game style              Char width × height (px)   Tile size
Top-down RPG (Stardew)  16 × 32                    16 px
Top-down adventure      16 × 24                    16 px
Platformer (Celeste)    8 × 11                     8 px
Platformer (Cuphead)    96 × 128                   - (no tilemap)
Action 2D (HK)          ~80 × 100                  varies
Tactical RPG iso        24 × 32                    24 px
JRPG overworld          16 × 16                    16 px
```

Width matters for **collider** more than visuals — make collider snug
to the in-game body, not the entire sprite (cape, hair shouldn't
collide).

Height matters for **camera framing** — short character = lots of
visible scenery; tall character = framed close.

## Expressions in low resolution

At 16×16 sprite, you have ~3 pixels for an eye, 1-2 for a mouth.
Limited expressiveness.

### Eye placement
- **Single pixel** = small character / cute.
- **2 pixels horizontal** = wider feel, looking forward.
- **2 pixels stacked** = anime-style emphasis.
- **3 pixels with one as pupil** = expressive but largest.

### Mouth placement
- **Single dark pixel** = "neutral / unimportant".
- **Curved 2-3 px line** = smile / frown.
- **Open mouth** = 1-2 px gap with darker interior.

### Expression frames
Even if main animation is shared, emotional expressions can be authored
as **face-only frames** (just eyes + mouth) and overlaid on the body.
Saves art cost. Used in many JRPGs.

States to author: neutral, happy, angry, surprised, sad, hurt, thinking
(7 covers most needs).

## Anatomy shortcuts in pixel art

At 32×32, full anatomical accuracy is impossible. Use shortcuts:

### Head as sphere
Round shape with hair / hat detail. Skip ears, neck, hairline. The
silhouette tells you "head".

### Body as triangle / trapezoid
Wider shoulders / hips, narrower waist (or vice versa). Avoid square
torso (looks blocky).

### Limbs as rectangles with joints
Upper arm + forearm + hand can be 3 pixels each. Joints not visible
when in idle pose, articulate during animation.

### Hair as silhouette accent
Hair is usually a blob attached to head shape. Avoid pixel-by-pixel
strands in low-res — looks noisy. Use 1-2 darker shade values for
internal hair shading.

### Hands
At 16×16, hands are 2-3 pixels — basically "abstract paws". Detailed
hands only at 32×32+. For wielding: anchor weapon to a fixed shoulder/
hand pixel; hand detail is implied.

## Faction / role visual language

Players read characters quickly when factions have **consistent visual
codes**:

### Class color coding
- Knight = blue / silver.
- Rogue = green / dark.
- Mage = purple / red.
- Healer = white / gold.
- Beast / monster = brown / red.

(Adjust to your game; the principle is consistency, not specific colors.)

### Silhouette family
Same faction shares **silhouette traits**: all knights have helmets,
all mages have cloaks, all rogues have hoods. Player learns the
language in seconds.

### Threat encoding
Bigger sprite = bigger threat. Spikes / horns / claws on enemies =
"dangerous". Friendly NPCs are smaller, rounder, less detail. Players
parse this without conscious thought.

### Gendered design (be careful)
Stylized 2D often uses cliché shorthand: long hair = female, beard =
male, etc. This works for readability but limits design space. Modern
indies often subvert deliberately. Choose based on game tone.

## Walk cycle conveys weight + attitude

The walk cycle is where character "feels". Different characters walk
differently:

- **Heavy character**: slow cadence, large vertical bob, weight on
  forward foot longer, low arm swing.
- **Light/agile character**: fast cadence, small bob, springy step,
  high arm swing.
- **Sneaky / cautious**: slow + low + arms close to body.
- **Confident / strut**: shoulders high, arms swing wide, longer
  stride, bobble in head.

Sample 8-frame walk for "heavy hero":
```
F1: contact, weight forward, 1px bob down
F2: full down position (lowest), recoil
F3: passing position, body lifting
F4: up position (highest), light moment
F5-F8: mirror of F1-F4 (other foot)
```

For light hero, compress to 6 frames, reduce vertical bob, faster
cadence.

## Player vs NPC distinction

In a busy crowd scene, the player MUST stand out:

- **Reserved color** for player (no NPC uses cyan, player uses cyan).
- **Higher contrast** between hero and bg vs NPC and bg.
- **Distinctive silhouette** (hero has cape; NPCs don't).
- **Outline difference** (hero's outline is full, NPCs are subtle).

Stardew Valley uses palette differentiation; Celeste uses size +
distinctive hair.

## Common bugs

- **Generic silhouette**: character forgettable. Add at least one
  distinctive shape element.
- **Symmetric silhouette**: hard to tell direction. Add asymmetric
  detail.
- **Pillow-shaded face**: round shading without form. Pick light
  direction.
- **Expressions read as random pixels**: too small for chosen detail.
  Either add height or simplify expression to 2-3 distinct pixels.
- **All NPCs look like player**: faction code missing or muted.
- **Walk cycle bobbles wrong**: contact frame is also up-position. Fix
  to alternate down → up.
- **Hands move arbitrarily**: anchor hand to fixed offset from shoulder.

## See also

- [pixel-art-fundamentals/SKILL.md](../pixel-art-fundamentals/SKILL.md)
- [animation-frames/SKILL.md](../animation-frames/SKILL.md) — walk cycles
- [palettes/SKILL.md](../palettes/SKILL.md) — palette swap for variants
- [environment-design/SKILL.md](../environment-design/SKILL.md) — character vs bg readability
