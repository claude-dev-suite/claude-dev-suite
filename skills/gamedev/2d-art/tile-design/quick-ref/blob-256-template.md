# Blob 256 / 47-tile template (Cantilever / Tilesetter)

## What is "blob"

The blob format is a compact 47-tile arrangement where each tile maps
to a unique combination of neighbor states. After the redundancy
collapse (diagonal can't be "same" if both adjacent cardinals are
"different"), 256 → 47.

## Template layout (7×8 grid)

Tilesetter and most blob generators output this canonical layout:

```
Row 0: full-surround variants (corners + interiors)
Row 1: top edges
Row 2: top edges with corner cutouts
Row 3: row + column intersections
Row 4: bottom edges
Row 5: bottom + side edges
Row 6: full edges (4-way connections)
Row 7: isolated + cap tiles
```

(Exact layout varies by tool; consult the tool's export spec.)

## Authoring strategy

You only need to paint **5-7 base tiles**:

1. **Interior** (fully surrounded): the "core" texture.
2. **Top edge** (N is "other"): horizontal edge piece.
3. **Bottom edge**: mirror of top, often.
4. **Left edge**: vertical edge piece.
5. **Right edge**: mirror of left.
6. **Outer corner** (one diagonal neighbor "other"): convex corner.
7. **Inner corner** (T-junction-like): concave.

Tilesetter / Cantilever's tool generates the 47 from these 5-7 by
mirroring + recombining. Manual hand-paint = 47 sprites = much more
work.

## Variant interior tiles

For repetition reduction (see [../SKILL.md](../SKILL.md) section
"Variant tiles"):

- Paint 2-4 alternative interior tiles (only used when surrounded
  fully by same terrain).
- Engine picks randomly with weighted probability.
- LDtk: `Auto-Layer rule with random tiles` directly supports this.

## Engine integration

### LDtk
Import blob tileset → Auto-Layer rules detect IntGrid pattern → place
correct tile from blob position.

### Unity (Tilemap)
Use **RuleTile** with custom rules per neighbor pattern:
```
Rules: bit 0 (N) | bit 1 (E) | bit 2 (S) | bit 3 (W) | (diagonals)
For each rule combination → assign blob tile.
```

Manual mapping is tedious; **TileMap-Toolkit** package automates
RuleTile generation from blob.

### Tiled
Wang Set with 8 colors per edge → similar mechanism, native UI.

## Common mistakes

- **Blob template visible artifacts**: edges don't quite line up after
  generation. Fix in source: re-paint base tiles to ensure pixel-
  perfect tileability.
- **Sub-pixel offset** in blob output: tool exports at non-integer
  scaling. Verify all blob tiles at integer grid.
- **Variant frequency wrong**: rare variant appears too often. Adjust
  weight (0.05 = visibly rare, 0.4 = mid frequency, 0.7 = common).
- **No transitional tiles** between two terrains: blob covers ONE
  terrain's edges (against generic "other"). For grass → dirt, you
  need a SECOND blob set (or composite the 2 terrains' blobs).

## See also

- [wang-bitmask-table.md](wang-bitmask-table.md) — neighbor encoding
- [hex-flat-vs-pointy.md](hex-flat-vs-pointy.md)
