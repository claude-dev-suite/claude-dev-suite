# Hex grids: flat-top vs pointy-top

## Two orientations

### Flat-top
Hex with horizontal top/bottom edges. Columns of hexes offset
vertically by half-height.

```
 ___       ___       ___
/   \     /   \     /   \
\___/ \___/ \___/ \___/ \___/
/   \     /   \     /   \
\___/ \___/ \___/ \___/ \___/
```

Use case: strategy / 4X (Civilization), board-game-feel.

Coordinate system commonly: **offset coordinates** (col, row) with
even/odd column shift, or **axial coordinates** (q, r).

### Pointy-top
Hex with vertical points (top + bottom). Rows offset horizontally.

```
   /\         /\         /\
  /  \       /  \       /  \
 /    \     /    \     /    \
 \    /     \    /     \    /
  \  /       \  /       \  /
   \/         \/         \/
```

Use case: tactical RPG (Final Fantasy Tactics-ish), puzzle.

## Tradeoffs

| Aspect | Flat-top | Pointy-top |
|--------|----------|------------|
| Vertical movement feel | "step up/down" pronounced | "weave" between rows |
| Horizontal movement | "weave" between cols | Strong horizontal direction |
| Camera natural orientation | Square-ish viewport | Wide / tall feel |
| Common engines | Civilization | Pokemon (loosely), various tactics |
| Rendering complexity | Same | Same |

Choose based on **movement priority**: which axis does the gameplay
emphasize?

## Coordinate systems

### Offset coordinates (col, row)
Easiest to render: hex at (col, row) → screen position based on
col*hex_width and row*hex_height with offset for even/odd col.

Hex distance computation harder (need to convert to cube).

### Axial coordinates (q, r)
2 of 3 cube coords (third = -q-r).

```
q axis: pointing right
r axis: pointing down-right (60° from q)
```

Distance: `(|q1-q2| + |q1+r1-q2-r2| + |r1-r2|) / 2`.

### Cube coordinates (x, y, z) with x+y+z=0
Conceptually clean. 3 axes 60° apart. Used for path-finding / range.

```
x + y + z = 0  always
distance = (|dx| + |dy| + |dz|) / 2
```

Most hex libraries use cube internally, axial for storage.

## Authoring tips

- **Tile shape**: paint the hex art with transparent corners. Don't
  paint a full square with hex inside — wastes texture space.
- **Padding**: 1-2 px padding around each hex in atlas (avoid
  texture bleed when filtering).
- **Boundary blending**: edges between two terrain hexes need
  transition art. 6 edge orientations × N terrain pairs = many
  transition tiles. Most strategy games skip and just have hard
  edges.
- **Terrain decals**: place trees, rocks, units AS SEPARATE sprites
  on top of base hex (not painted into the hex itself). Allows
  composition.

## Engine notes

| Engine | Hex support |
|--------|------------|
| **Unity** | Hexagonal grid in Tilemap (Pointy-Top, Flat-Top via Grid.cellLayout); Hex Collision Tile |
| **Godot 4** | TileMap supports hex (Half Offset = "Vertical" or "Horizontal") |
| **Tiled** | Native hex support, both orientations |
| **LDtk** | Square only (no hex) as of v1.x |

LDtk + hex = manual workaround (custom asset stretched to look like
hex visually, but logical grid is square).

## Common pitfalls

- **Mismatched hex orientation across team**: agree on flat-top vs
  pointy-top BEFORE authoring. Switching mid-project = redraw all.
- **Sub-pixel rendering on hexes**: zooming non-integer breaks sharp
  edges. Pixel-perfect camera helps.
- **Pathfinding bugs from coord conversion**: stick with one coord
  system, only convert at boundaries.
- **Even/odd column inconsistency**: hex at (1, 0) and (1, 1) — what
  are their world positions? Document the offset rule clearly.
