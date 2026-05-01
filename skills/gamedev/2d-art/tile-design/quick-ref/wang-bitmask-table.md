# Wang autotile bitmask reference

## 4-bit Wang (cardinal-only, 16 tiles)

```
bit 0 = N neighbor same?
bit 1 = E neighbor same?
bit 2 = S neighbor same?
bit 3 = W neighbor same?

mask = (N<<0) | (E<<1) | (S<<2) | (W<<3)
```

| Mask | Neighbors same | Tile shape |
|------|----------------|-----------|
| 0  | none | isolated tile (full surround of "other") |
| 1  | N | tile bottom-edge facing |
| 2  | E | tile west-edge facing |
| 3  | N+E | inner corner SW |
| 4  | S | tile top-edge facing |
| 5  | N+S | vertical column |
| 6  | E+S | inner corner NW |
| 7  | N+E+S | T-junction with W gap |
| 8  | W | tile east-edge facing |
| 9  | N+W | inner corner SE |
| 10 | E+W | horizontal row |
| 11 | N+E+W | T-junction with S gap |
| 12 | S+W | inner corner NE |
| 13 | N+S+W | T-junction with E gap |
| 14 | E+S+W | T-junction with N gap |
| 15 | all | full interior |

## 8-bit RPGMaker / 47-tile

Considers diagonals only when both adjacent cardinals are same. Layout
is the standard RPGMaker A2 autotile format: 4 sub-tiles per
"super-tile", 4×4 grid layout per terrain block.

Reduces 256 theoretical combinations to **47 unique tiles** (others are
geometrically impossible, e.g., NE diagonal "same" but N and E
"different" cannot occur).

## 8-bit blob (256-tile, 47 unique after symmetry)

```
bit 0 = N
bit 1 = NE
bit 2 = E
bit 3 = SE
bit 4 = S
bit 5 = SW
bit 6 = W
bit 7 = NW

mask = sum_all 8 neighbors

Adjustment:
NE bit zeroed if (N==0 || E==0)  // can't have NE diagonal w/o adjacent cardinals
SE bit zeroed if (S==0 || E==0)
SW bit zeroed if (S==0 || W==0)
NW bit zeroed if (N==0 || W==0)
```

After adjustment, 256 → 47 valid masks. Standard blob template
(Cantilever / Tilesetter) maps each to a tile in a 7×8 sheet layout.

## Slope encoding tricks (platformer-specific)

Use spare bits in the mask for slope info:

```
bit 7 = "this is a slope tile" (overrides terrain blending)
bit 8-9 = slope angle (00=22.5°, 01=45°, 10=67.5°, 11=full vertical)
bit 10 = direction (0=ascending right, 1=ascending left)
```

This is not Wang-standard; engines like LDtk handle slope via
"layer overrides" rather than bitmask extensions.

## Quick implementation (pseudocode)

```python
def autotile_index(grid, x, y, terrain):
    n = grid[x, y-1] == terrain
    e = grid[x+1, y] == terrain
    s = grid[x, y+1] == terrain
    w = grid[x-1, y] == terrain
    return (n << 0) | (e << 1) | (s << 2) | (w << 3)
```

Then `tile = tileset[autotile_index]`.

## Sources

- Tilesetter docs: blob 256 template.
- Cantor/Cantilever blob spec.
- LDtk Auto-Layer rules manual.
- Tiled Wang Set tutorial.
