---
name: gamedev-2d-art-tile-design
description: |
  Tile design for 2D games: autotiling math (Wang 4-bit, 16-bit, 47-tile,
  256-tile blob), grid types (square / hex flat-top / hex pointy-top /
  staggered iso / true iso), terrain blending, transitional pieces,
  modular vs composite tilesets, 9-slice rendering.

  USE WHEN: planning tilesets, choosing autotile schemes, mixing terrains,
  designing isometric or hex maps, debugging tile transitions.

  DO NOT USE FOR: engine-specific tilemap APIs (Unity Tilemap component,
  Godot TileMap node) - use the engine skill (e.g., `unity-2d-tilemap`).
allowed-tools: Read, Grep, Glob
---

# 2D Tile Design

> **Quick refs**: [wang-bitmask-table.md](quick-ref/wang-bitmask-table.md),
> [blob-256-template.md](quick-ref/blob-256-template.md),
> [hex-flat-vs-pointy.md](quick-ref/hex-flat-vs-pointy.md)

Tile design = how the **art** for a tilemap is structured so the engine
can blend tiles seamlessly. The math doesn't care about the engine — same
rules apply in Unity Tilemap, Godot TileMap, Tiled, LDtk, custom raylib /
SDL renderers.

## Grid types

| Grid | Use case | Tile orientation |
|------|----------|-----------------|
| **Square (ortho)** | Most platformers, top-down RPGs | Axes aligned, simplest |
| **Hex flat-top** | Strategy / 4X (Civilization-style) | Hex columns offset Y |
| **Hex pointy-top** | Tactical RPG, board-game-look | Hex rows offset X |
| **Staggered isometric** | RPG, city-builder (Diablo, Stardew base) | Diamond grid stored as offset 2D array |
| **True isometric** | "2.5D" rendering with depth sorting | Z-axis depth, manual y-sort |

**Choosing**: hex = no diagonal-vs-orthogonal asymmetry, expensive in
art. Iso = depth feel, ~3x art cost (multiple facing). Square = cheapest
but has diagonal-step ambiguity.

## Tile sizing conventions

```
8 px    GameBoy / classic 8-bit, very low-res
16 px   SNES / Genesis era, modern lo-fi (Stardew Valley, Celeste)
24 px   Aseprite default for Halloween
32 px   Modern indie sweet spot (Hyper Light Drifter, RPG Maker)
48 px   Larger pixel art (Owlboy, Cuphead)
64 px   HD pixel art / hybrid
128 px+ Painterly 2D (Ori, Hollow Knight)
```

**Pixel-per-unit consistency**: keep ALL tilesets at the same PPU per
project. Mixing 16px and 32px in one scene without explicit scale
breaks the pixel-perfect look. In Unity: `Sprite Import Settings → Pixels
Per Unit = tile_size`.

## Autotiling: the math

Autotiling = at runtime (or design-time), pick the right tile based on
neighbors. Three common schemes:

### Wang 4-bit (16-tile)

Looks at the **4 cardinal neighbors** (N, E, S, W). Each is "same
terrain" or "different".

```
bit 0 = N (same?)
bit 1 = E
bit 2 = S
bit 3 = W

mask = (N<<0) | (E<<1) | (S<<2) | (W<<3)
tile_index = mask  // 0..15
```

16 tiles needed. Cheap. Limitation: **doesn't handle diagonal corners**
— a tile with N+E neighbor doesn't know if NE diagonal is also same,
so concave corners look wrong.

### Wang 8-bit (47-tile a.k.a. RPGMaker)

Considers diagonals only IF both adjacent cardinals are same. Avoids
the 256 explosion. Reduces to **47 unique tiles** (the rest are
mathematical impossibilities).

This is the RPG Maker autotile format. Most efficient hand-painted
scheme.

### Blob (256-tile / "Mark Cantilever pattern")

Considers all 8 neighbors. 2^8 = 256 combinations, but only ~47-48
unique after symmetry collapse. Tilesetter and Cantilever's blob
template provide automatic generation from 5-7 base tiles.

See [quick-ref/blob-256-template.md](quick-ref/blob-256-template.md)
for the canonical layout.

## Terrain transitions

When two terrains meet (grass + dirt, dirt + stone), you need
**transition tiles**:

- **Edge tiles** (cardinal): grass→dirt N/E/S/W edges (4 base, +mirrors)
- **Outer corner**: convex corner (dirt poking into grass)
- **Inner corner**: concave (grass wrapping around dirt)
- **T-junctions** and **X-intersections** (rare, often skipped)

For hand-painted: **paint base + edge tiles** (~12-15 sprites), then
the autotile rule lookup picks them. For truly modular: use blob with
~5 base tiles and let the algorithm fill 47 variants.

## Modular vs composite tilesets

**Modular (mosaic)**: every cell is one tile. Engine handles blending.
- Pro: cheap, autotileable.
- Con: visible repetition without variant tiles.

**Composite (decoration layer)**: base modular layer + larger
"decoration" sprites painted on top (single tree spans 3 tiles, broken
wall spans 2). Almost mandatory for non-grid games.
- Pro: organic, varied.
- Con: harder collision, harder Z-sort.

Most modern 2D games combine both: modular base layer + decoration
sprites + foreground accents.

## Variant tiles (repetition reduction)

For each terrain type, paint **3-5 variants** of the "fully-surrounded"
tile (interior tile). Engine picks randomly with weighted probability:
common variant 70%, alt 20%, rare 10%. Breaks visible repetition.

LDtk supports this natively; Unity Tilemap needs custom Rule Tile.

## Slopes / ramps for platformers

Tilemaps + slopes is non-trivial. Two approaches:

1. **Slope tiles in tileset** with collision shapes set per-tile
   (Tiled / LDtk: collision objects per tile; Unity Tilemap Collider 2D
   uses per-tile shape if PolygonCollider2D variants).
2. **Composite collider per region** (group of slope tiles → one
   PolygonCollider2D drawn around them).

Most platformers use #1 with 22.5° / 45° / 67.5° slopes (3 angles
typically). See [quick-ref/wang-bitmask-table.md](quick-ref/wang-bitmask-table.md)
for slope encoding tricks.

## 9-slice tiles

For walls, UI panels, repeating bars: paint a 3×3 grid where corners
stay fixed, edges tile, center repeats. Engines render any size from
the same 9 cells.

Unity: Sprite Import Settings → Mesh Type Full Rect → set borders in
Sprite Editor. Tiled: drawn manually. Use for stretchy walls, dialog
boxes, status bars.

## Collision shape per tile

Per-tile collision shape (Tiled `objectgroup` / LDtk auto-tile collision
on IntGrid / Unity Tilemap Custom Physics Shape):

```
Square tile:        full square AABB
Slope tile (45°):   triangle (lower-left to upper-right)
Slope tile (22.5°): triangle (1/2 height start)
Cliff edge:         partial square (one-way platform top)
```

Each authoring tool stores collision differently; export to engine
needs adapter.

## Common bugs

- **Mismatched PPU**: 16px tiles imported at PPU=32 → sprites half size.
- **Sub-pixel tile positioning**: tiles drawn at fractional pixel
  coordinates → bleeding/gaps. Solution: snap camera to integer pixel.
- **Texture bleeding** at tile edges in atlases: solve with 1-2 px
  padding around each tile in the atlas (TexturePacker `--extrude`).
- **Wang scheme that ignores diagonals** painted with concave corners
  → visible "missing piece" at inner corners.
- **Inconsistent variant frequency**: heavy variant overuse looks
  noisy; rare variant invisible. Tune weights.

## Tools mapping

| Tool | Tile authoring | Autotile rules |
|------|----------------|----------------|
| **Aseprite** | Tilemap mode (since v1.3) | Manual; export per-tile |
| **Tiled** | Tileset + Wang/Terrain editor | Built-in Wang sets |
| **LDtk** | IntGrid + Auto-Layer rules | Most powerful: rule-based pattern match |
| **Tilesetter** | Specialized, generates blob | Blob + Wang automatic |
| **PyxelEdit** | Tile-aware editor | Limited autotile |

For modern indie 2D: **LDtk** is the strongest level editor; **Tilesetter**
is the strongest autotile generator. Use them together.

## See also

- [pixel-art-fundamentals/SKILL.md](../pixel-art-fundamentals/SKILL.md)
- [seamless-textures/SKILL.md](../seamless-textures/SKILL.md)
- [tools/SKILL.md](../tools/SKILL.md)
- Engine integration: `gamedev/unity-2d-tilemap`
