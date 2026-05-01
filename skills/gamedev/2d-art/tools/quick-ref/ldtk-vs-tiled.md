# LDtk vs Tiled detailed comparison

Both are popular 2D level editors. Choosing wrong = costly retrofit.

## Quick verdict

| Use case | Choose |
|----------|--------|
| Modern indie 2D action / platformer / RPG | **LDtk** (better autotile, IntGrid abstraction) |
| Strategy / 4X / hex-based | **Tiled** (better hex support, more mature) |
| Need Python plugin scripting | **Tiled** (LDtk has limited extension) |
| Rapid prototyping with auto-tiling | **LDtk** (rule-based autotile is unmatched) |
| Need very large maps | **Tiled** (chunked storage, has been used for huge worlds) |
| Console / mobile target with strict size budget | **Tiled** (more efficient binary export options) |
| Beginner-friendly | **LDtk** (UX is more polished) |

## Feature comparison

| Feature | LDtk | Tiled |
|---------|------|-------|
| **Tile layers** | Yes | Yes |
| **Object layers** | Entities (typed) | Object groups (generic) |
| **Auto-tiling** | Rule-based (most powerful) | Wang sets (limited) |
| **IntGrid layer** | Yes — abstract gameplay logic | No (use object layer + custom data) |
| **Tile collision** | Per-tile collision via IntGrid + auto rules | Per-tile via objectgroup |
| **Multi-level worlds** | Yes (world view, levels with positions) | No native (manual organization) |
| **Hex grid** | No (square only as of v1.x) | Yes (flat-top + pointy-top) |
| **Iso grid** | Yes | Yes (staggered + true) |
| **Variants per tile** | Yes (random with weights) | Limited |
| **Custom fields per entity** | Strong typing (string, int, color, enum, point, ...) | Generic property strings |
| **Animated tiles** | No native | Yes |
| **Plugins / scripting** | None | Python plugins |
| **Multi-user collab** | No | No (both single-author) |
| **Export formats** | JSON (rich), GodotImporter, LDtk Unity | TMX/JSON, custom plugins |
| **Engine importers** | Unity (LDtkUnity), Godot, Phaser, Heaps | Unity (Tiled2Unity), Godot, Phaser, almost everything |

## LDtk strengths

### IntGrid layer
Gameplay logic lives in IntGrid (1=wall, 2=floor, 3=spike). Sprite
representation lives in Auto-Layer rules. **Designer changes layout
in IntGrid; sprites update automatically.**

This separates "what blocks the player" from "what shows on screen".
Massive iteration speedup.

### Auto-Layer rules
Pattern-match around an IntGrid value, place tiles. Can express:
- "Wall + floor below = wall-edge tile"
- "Corner of two walls = corner tile"
- "Random one of 3 grass variants on floor"

Most powerful autotile system. Replaces hand-painted Wang sets.

### Multi-level worlds
World view shows all levels in their relative positions. Designer
moves levels in 2D space, defines connections. Critical for
metroidvania.

### Custom entity types
Define entity templates with typed fields:
```
Enemy:
  hp: int
  patrol_path: pointArray
  drop: enum(Coin, Heart, Key)
  facing: enum(Left, Right)
```
Designer drops Enemy on map, fills fields in inspector. Engine reads
typed JSON.

## Tiled strengths

### Hex support
Flat-top + pointy-top hex grids. Critical for strategy / 4X / tactics.
LDtk has nothing.

### Animated tiles
Tile can have animation frames defined IN the tileset. Renderer cycles
through. Save tons of authoring vs LDtk's "animate via sprites".

### Plugin scripting
Python plugins for custom export formats, batch operations, custom
tools. LDtk has no equivalent.

### Mature ecosystem
Decade-old tool. Supports almost every engine. Bug-free, stable, lots
of community knowledge.

### Chunked map support
For huge maps (open-world, MMO scale), Tiled supports chunked
storage. LDtk doesn't.

## Workflow differences

### LDtk
1. Design IntGrid layout (gameplay logic).
2. Define Auto-Layer rules (visual representation).
3. Place entities with typed fields.
4. Export JSON → engine importer creates levels.

### Tiled
1. Define tilesets (often with Wang or terrain sets).
2. Paint tiles directly in tile layer.
3. Add object layers for collision / spawn / triggers.
4. Use custom properties for entity data.
5. Export TMX → engine reads.

LDtk's separation is more designer-friendly. Tiled's direct painting is
more flexible / familiar to traditional level designers.

## Recommendation by genre

| Genre | Choose | Reason |
|-------|--------|-------|
| 2D platformer | LDtk | Auto-tile + entities + multi-level world |
| Top-down action RPG | LDtk | Auto-tile + entities |
| Strategy / 4X | Tiled | Hex support |
| JRPG (overworld + dungeons) | LDtk or Tiled | LDtk for worlds, Tiled for traditional tile painting |
| Tactical RPG | Tiled | Hex + iso |
| Match-3 / puzzle | Tiled | Smaller, simpler |
| Adventure (Stardew-like) | LDtk | Auto-tile + entities + world view |

## Migration cost

Switching after starting = 2-5 days of rebuilding. Convert script can
auto-import some data, but custom rules + entity typing don't translate.

**Decide upfront**, ideally on day 1 of project.

## Engine integration tooling

### LDtk → Unity: LDtkUnity (free, MIT)
Mature, well-maintained. Imports LDtk → Unity GameObjects with
components from typed entity fields.

### LDtk → Godot: Built-in importer (since v4)
Native. Solid.

### Tiled → Unity: Tiled2Unity (legacy) / SuperTiled2Unity (active)
Less polished than LDtk's Unity importer.

### Tiled → Godot: Native (since v3.x)
Solid.

### Both → Phaser: native loader
Both work fine in Phaser.

## See also

- [aseprite-shortcuts.md](aseprite-shortcuts.md)
- [aseprite-lua-scripting.md](aseprite-lua-scripting.md)
- [../SKILL.md](../SKILL.md)
- `gamedev/2d-art/tile-design`
