---
name: unity-2d-tilemap
description: |
  Unity 2D Tilemap — Grid + Tilemap, Rule Tiles, Animated Tiles, Tile Palette,
  Hexagonal/Isometric grids, Composite Collider 2D + Tilemap Collider 2D,
  procedural tilemap generation.

  USE WHEN: building level geometry from tiles, painting auto-tiling terrain,
  isometric/hex maps, optimising tilemap colliders, runtime tilemap generation.

  DO NOT USE FOR: free-form sprites (use `unity-2d-core`); platforming
  movement (use `unity-2d-gameplay`); 2D physics general topics (use
  `unity-2d-physics`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Tilemap

## Grid + Tilemap hierarchy

```
Grid (component on parent)
└── Tilemap_Background   Tilemap + TilemapRenderer
└── Tilemap_Ground       Tilemap + TilemapRenderer + TilemapCollider2D + Rigidbody2D(Static) + CompositeCollider2D
└── Tilemap_Decorations  Tilemap + TilemapRenderer
```

One Grid → multiple child Tilemaps. Sorting per Tilemap via Sorting Layer + Order in Layer.

## Tile types

| Tile | Use |
|---|---|
| **Tile** | Single sprite per cell |
| **Animated Tile** | Sprite cycles through frames at set speed (rivers, torches) |
| **Rule Tile** | Auto-picks sprite based on neighbor cells — borders, corners, isolated rocks |
| **Random Tile** | Picks one sprite at random from a list (variation in flat ground) |

`com.unity.2d.tilemap.extras` package adds Rule/Animated/Random/Hexagonal Rule tiles.

### Rule Tile — auto-tiling pattern

```
For ground tiles:
  Top neighbor empty + sides full → top edge sprite
  All neighbors full → solid interior sprite
  Top + right empty → top-right corner sprite
  ... etc
```

Define the matrix in the Rule Tile inspector — a 3×3 grid of `Filled / Empty / Don't Care` per rule.

## Tile Palette

`Window > 2D > Tile Palette`. Drag sprites in → it generates Tiles automatically. Use brushes (Default, Random, Animated, Custom) to paint efficiently.

## Composite Collider for performance

Per-cell colliders = many small physics objects. Composite collapses them into one polygon:

```
Tilemap_Ground (GameObject)
├── TilemapCollider2D       Used By Composite = ON
├── Rigidbody2D             Body Type = Static
└── CompositeCollider2D     Geometry Type = Polygons (or Outlines)
```

Result: one collider for the entire tilemap → physics queries cheap, broadphase fast.

## Hexagonal & Isometric grids

`Grid > Cell Layout`:

| Layout | When |
|---|---|
| Rectangle | Standard top-down / side-scroller |
| Hexagon (Pointy-Top) | TBS / 4X games |
| Hexagon (Flat-Top) | Stylistic preference |
| Isometric | "Diablo-like" 2.5D |
| Isometric Z as Y | Faking depth in iso (objects further north appear behind) |

For iso, add **Anti-Aliasing** to the camera and use **Sorting Group** carefully on multi-cell sprites (trees, towers).

## Procedural tilemap generation

```csharp
public class CaveGenerator : MonoBehaviour {
    [SerializeField] private Tilemap tilemap;
    [SerializeField] private TileBase wallTile;
    [SerializeField] private TileBase floorTile;
    [SerializeField] private int width = 64;
    [SerializeField] private int height = 64;
    [SerializeField] private float fillPct = 0.45f;

    public void Generate(int seed) {
        var rng = new System.Random(seed);
        for (int x = 0; x < width; x++)
        for (int y = 0; y < height; y++) {
            bool wall = rng.NextDouble() < fillPct;
            tilemap.SetTile(new Vector3Int(x, y, 0), wall ? wallTile : floorTile);
        }
        // (typical next step: cellular automata smoothing)
    }
}
```

Use `tilemap.SetTilesBlock` for batch writes — much faster than per-cell `SetTile` for big maps.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Per-cell colliders without Composite | TilemapCollider2D `Used By Composite = ON` + CompositeCollider2D + static Rigidbody2D |
| Painting collisions onto deco tilemap | Separate visual tilemap from collision tilemap |
| One huge tilemap for a sprawling world | Chunked tilemaps streamed by Addressables / scene loading |
| `SetTile` per cell in a loop for procgen | `SetTilesBlock` with prepared arrays |
| Mixing iso + rectangle on same Grid | One Grid type per scene |

## Production checklist

- [ ] Tilemaps split by purpose (background / ground / decorations / collision)
- [ ] Collision tilemap uses Composite Collider 2D
- [ ] Rule Tiles for auto-tiling terrain — no per-tile painting of edges
- [ ] Tile Palette saved as asset, version-controlled
- [ ] Big maps chunked / streamed
- [ ] Sorting strategy consistent across tilemaps
