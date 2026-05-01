# Hue shifting recipes

Shading without hue shifting = boring gray ramps. Shading WITH hue
shifting = alive, moody.

## The principle

Naive ramp:
```
darkest → mid → lightest    (just lightness change)
hue stays the same throughout
```

Hue-shifted ramp:
```
darkest:  hue shifted toward COOL (blue/purple), low S, low L
mid:      base hue, mid S, mid L
lightest: hue shifted toward WARM (yellow/orange), high S, high L
```

The "warm light, cool shadow" rule mimics natural light + ambient sky
fill.

## Standard recipes

### Skin (warm bias overall)
```
Shadow:  warm red/brown (#5a3232) — hue 0°
Mid:     skin tone (#b07060) — hue 20°, mid S
Light:   peach (#f0c898) — hue 30°, low S
Hilight: pale yellow (#fde0a8) — hue 40°, very light
```
Hue shifts 0° → 40° (warmer) as you go lighter. Skin is warm-biased.

### Foliage (green base)
```
Shadow:  deep teal/blue (#1a3a3a) — hue 180°
Mid:     forest green (#2e6a3a) — hue 130°
Light:   yellow-green (#7a9a4a) — hue 80°
Hilight: pale yellow (#dadc7a) — hue 60°
```
Hue rotates 180° → 60° as light increases (cool blue → warm yellow).
Maximum visual interest.

### Stone / cliff (cool base)
```
Shadow:  dark purple (#2a2638) — hue 270°
Mid:     blue-gray (#4a4252) — hue 260°
Light:   warm gray (#8e8896) — hue 250°
Hilight: pale yellow-gray (#c2bda8) — hue 50° (warm flip!)
```
Most of the ramp stays cool; only highlight flips warm. Strong
"sunlit" feel.

### Water (cool, more saturated)
```
Shadow:  deep navy (#1a2a4a) — hue 220°
Mid:     blue (#2e4a76) — hue 215°
Light:   sky blue (#5278a8) — hue 210°
Hilight: pale cyan (#b8d8f0) — hue 200°
```
All cool, but hue rotates slightly + saturation drops as light increases.
Crisp watery feel.

### Fire / lava
```
Smoke:   dark red-brown (#3a1a0a) — hue 10°
Cool fire: dark red (#a02018) — hue 5°
Mid fire: orange (#e8801a) — hue 25°
Hot fire: yellow (#f8d020) — hue 50°
White-hot: pale yellow (#fff8c8) — hue 55°
```
Rotation 10° → 55°. Saturation peaks in mid orange. Whitehot at top.

### Cloth (subtle, unsaturated)
```
Shadow:  warm dark (#2a2620) — hue 30°
Mid:     fabric color — your choice
Light:   slightly cool light variant
Hilight: clean off-white (#e8eee8) — hue 100° subtle
```
Subtle hue shift. Cloth doesn't need dramatic shading.

### Metal
```
Body:    cool steel (#5e6878) — hue 220°
Shadow:  dark blue (#2e3848) — hue 220°
Light:   warm-tinted highlight (#a8b0a8) — hue 60° (warm flip)
Hilight: near-white (#f8f8f0) — neutral
```
Metal often has WARM specular highlight + cool base. Looks "polished".

## Practice tip

Pick any base color. In Aseprite color picker:
- Drop L by 30%, rotate hue 20° toward blue (cooler) → shadow
- Boost L by 20%, rotate hue 15° toward yellow (warmer) → highlight
- Repeat for 5-color ramp

Compare against straight-line ramp (just adjust L). The hue-shifted
version always looks better.

## When NOT to hue-shift

- **Monochrome game** (intentional): keep the strict-no-hue look.
- **Very saturated palettes** like PICO-8: pre-defined ramps; pick from
  palette only. Some PICO-8 ramps already hue-shift naturally
  (e.g., dark green → light yellow-green).
- **High-contrast graphic art**: hue-shifting reduces contrast in
  some cases. Direct color shift might be cleaner.

## Tooling

- **Aseprite**: drag ramp through HSV color picker manually.
- **GIMP**: Curves filter on hue channel.
- **Lospec ramps**: many palettes ALREADY have ramped colors. Use
  those instead of inventing.

## Common mistakes

- **Pure value gradient (no hue shift)**: "gray" feeling.
- **Over-aggressive hue shift**: ramps go from blue to red — looks
  rainbow / weird.
- **Saturation crushed in shadow**: fully gray shadow = lifeless. Keep
  some chroma.
- **Different ramps for each material in same scene**: looks
  uncoordinated. Use a project-wide ambient direction (warm light
  upper-left, cool shadow lower-right) and apply consistently.
