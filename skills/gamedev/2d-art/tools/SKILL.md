---
name: gamedev-2d-art-tools
description: |
  Tool ecosystem for 2D game art: Aseprite (de facto pixel art DCC),
  Tiled, LDtk, Tilesetter (autotile generation), Pixelorama (FOSS),
  Spine / DragonBones (skeletal 2D), TexturePacker, Sprite Lamp /
  Sprite DLight (normal maps), PSD Importer / Aseprite Importer,
  Krita / Procreate / Photoshop for higher-res 2D.

  USE WHEN: choosing tools for a 2D project, integrating tool output
  with engine, scripting Aseprite Lua, evaluating LDtk vs Tiled.
allowed-tools: Read, Grep, Glob
---

# 2D Game Art Tool Ecosystem

> **Quick refs**: [aseprite-shortcuts.md](quick-ref/aseprite-shortcuts.md),
> [ldtk-vs-tiled.md](quick-ref/ldtk-vs-tiled.md),
> [aseprite-lua-scripting.md](quick-ref/aseprite-lua-scripting.md)

## Aseprite (the standard)

Pixel-art DCC. **Buy once $20 / FOSS source available** (compile
yourself for free, but the binary is paid). De-facto industry standard
for indie pixel art. Used by Stardew Valley, Celeste, Hyper Light
Drifter, hundreds more.

Key features:
- **Layers + groups** with blend modes.
- **Animation** (timeline, onion skin, tags, per-frame duration).
- **Tilemap mode** (since v1.3) — author tilesets natively.
- **Slice tool** for sub-region metadata (collision, hitboxes).
- **Symmetry** (X/Y mirror painting).
- **Indexed mode** for palette swaps.
- **Lua scripting** (extensive API for batch operations, custom tools).
- **Aseprite Importer for Unity** (native, Unity Asset Store / OpenUPM).
- Export: PNG, GIF, sprite sheet + JSON sidecar.

Companion: **Pixelorama** = FOSS alternative (GDScript-based, Godot
project). Less polished, less docs, but free.

## Tiled (level editor, generic)

Free + open-source. Multi-platform. Mature. Most engines have an
importer.

- **Tilesets**: import from PNG, define tile properties.
- **Tile layers** + **object layers** (collision, spawn points).
- **Wang sets** built-in (autotile).
- Custom properties per tile, per object, per layer.
- Export: TMX (XML), JSON. Engine importers everywhere.

Strengths: stable, scriptable (Python), well-documented, supports
hexagonal + isometric out of box. Weaker auto-tiling than LDtk.

## LDtk (Level Designer Toolkit)

By Sébastien Bénard (creator of Dead Cells). Newer than Tiled, gaining
ground rapidly in indie scene.

- **IntGrid layers**: design with abstract values (1=wall, 2=floor),
  rules paint sprites on top — separates **gameplay logic** from
  **visual representation**.
- **Auto-Layer rules**: pattern-match IntGrid → place tiles.
  Most powerful autotile system available.
- **Levels** in a **world** (multi-level layout).
- **Entities** with custom fields (gameplay objects).
- Exports: JSON (rich), GodotImporter, **LDtk Unity** importer
  (well-maintained), Phaser, Heaps, custom.

Strengths: rule-based autotile, multi-level worlds, gameplay-friendly
IntGrid abstraction.

Weaknesses: less scriptable than Tiled (no Python plugin), newer = less
community content.

See [quick-ref/ldtk-vs-tiled.md](quick-ref/ldtk-vs-tiled.md) for the
detailed comparison.

## Tilesetter (autotile generator)

Specialized: generates autotile patterns from a few base tiles. ~$10.
Output: PNG tileset + JSON metadata.

- Provide 4-7 base tiles (interior, edge, corner).
- Tilesetter generates blob (256-tile / 47-tile) automatically.
- Export to engine.

Use case: don't want to hand-paint 47 transition tiles.

## Pixel-art alternatives

| Tool | Cost | Notes |
|------|------|------|
| **Aseprite** | $20 / FOSS source | Industry standard |
| **Pixelorama** | Free / FOSS | Godot-based, growing |
| **Pyxel Edit** | $9 | Tile-aware, Windows |
| **Piskel** | Free / browser | Simple, online |
| **GraphicsGale** | Free | Legacy, Windows-only |

## Skeletal 2D animation

For high-frame-count animation that would be impractical frame-by-frame
(complex characters with 200+ frame animations across many states).

### Spine
- Industry standard ($69-299).
- Skeletal rigging: bones, IK, mesh deformation, free-form deformation.
- Runtimes for Unity, Unreal, Godot, Cocos2d, libGDX, etc.
- Used by: Hollow Knight, Dragon Age 2D portraits.

### DragonBones
- FOSS alternative.
- Similar feature set, runtimes for Unity, Cocos2d-x, Phaser, etc.
- Less polished than Spine.

### Unity 2D Animation Package
- Built-in to Unity.
- Bone-rigging via Sprite Editor.
- Less features than Spine, but free + integrated.

When to use skeletal vs frame-by-frame:
- Skeletal: 100+ frames per character, 10+ animations, characters with
  many parts.
- Frame-by-frame: pixel art, ≤20 frames per animation, distinctive
  silhouettes per frame.

## Normal map authoring

### Sprite Lamp
$15. Lighting-pass based: provide 3-4 directional renderings, get
normal map. Quality:high. Used by: Owlboy, Dust: An Elysian Tail.

### Sprite DLight
$15. Procedural: just provide diffuse, get a heuristic normal map.
Quality: medium. Fast workflow.

### Materialize
Free. Cross-platform. Generates normal + height + AO. Less specialized
for pixel art but versatile.

### Manual painting in Photoshop / Krita
Highest quality, slowest. Paint each pixel directly in normal-map color
space.

## TexturePacker

Standard atlas generator. ~$40 (free for personal projects with
limitations).

- Pack many sprites into atlases.
- Trim transparent borders.
- Auto-extrude (anti-bleeding padding).
- Output: JSON / XML / Unity / Godot / Phaser-specific formats.

In Unity: typically use the built-in Sprite Atlas instead.
In raw / browser engines: TexturePacker is essential.

## Engine import pipelines

### Unity
- **Aseprite Importer** (Unity, com.unity.2d.aseprite): native .ase
  reading. Generates AnimationClips per Aseprite tag. Recommended.
- **PSD Importer** (com.unity.2d.psdimporter): Photoshop PSDs as
  multi-layer sprites. Good for character rigs.
- **Sprite Atlas v2**: pack sprites at build time.

### Godot
- **AsepriteWizard** (community add-on): import .ase → AnimatedSprite2D
  + frames.
- **TextureRegion editor** built-in.

### Phaser / web
- TexturePacker JSON output → Phaser Atlas loader.
- Aseprite JSON sidecar can be parsed manually.

## Larger-resolution 2D tools

For non-pixel-art 2D (painterly, vector):
- **Procreate** (iPad, $13): mobile painting.
- **Krita** (FOSS): desktop painting, Linux/Mac/Win.
- **Photoshop** (subscription): industry standard for digital painting.
- **Affinity Photo / Designer** ($55 each, no subscription): Photoshop
  / Illustrator alternatives.
- **Clip Studio Paint** ($50): manga + animation focus.
- **Figma**: vector UI design.

For vector specifically (UI, scalable assets): Affinity Designer or
Figma.

## File format cheat sheet

| Format | Use case |
|--------|---------|
| `.ase` / `.aseprite` | Aseprite native (binary) |
| `.psd` | Photoshop, Krita, Procreate native; Unity PSD Importer |
| `.png` | Universal sprite export |
| `.gif` | Animated preview, web, social |
| `.webp` | Smaller than PNG, animated, modern web |
| `.tmx` | Tiled XML |
| `.json` | Tiled / LDtk / TexturePacker / Aseprite sidecar |
| `.atlas` | TexturePacker / Spine binary |
| `.spine` / `.json` | Spine binary / runtime JSON |

## AI-assisted generation

For AI-driven sprite / pixel-art / tileset generation (PixelLab, Scenario,
Leonardo, Retro Diffusion, Stable Diffusion + LoRAs) see the dedicated
[ai-art-tools/SKILL.md](../ai-art-tools/SKILL.md). Short take:
**PixelLab** is the purpose-built choice for pixel art with native
sprite-sheet + animation output and an Aseprite plugin; **Scenario** wins
for project-style-locked asset libraries; **Stable Diffusion + a
pixel-art LoRA** is the free, fully-local route for technical artists.

## See also

- [ai-art-tools/SKILL.md](../ai-art-tools/SKILL.md) — AI generators trade-offs
- [tile-design/SKILL.md](../tile-design/SKILL.md)
- [animation-frames/SKILL.md](../animation-frames/SKILL.md)
- [seamless-textures/SKILL.md](../seamless-textures/SKILL.md)
- Engine: `unity-2d-core`, `unity-2d-animation`, `unity-2d-tilemap`
