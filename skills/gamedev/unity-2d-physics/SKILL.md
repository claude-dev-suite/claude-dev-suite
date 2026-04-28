---
name: unity-2d-physics
description: |
  Unity 2D physics — Rigidbody2D body types, Collider2D shapes, joints,
  effectors, layer collision matrix, contact filters, IEEE physics gotchas
  in 2D, raycast/overlap APIs.

  USE WHEN: tuning Rigidbody2D movement, joint setups (hinge/spring/distance/
  slider), one-way platforms, conveyor belts, area effects, layered collisions,
  raycast queries.

  DO NOT USE FOR: 3D physics (use `unity-physics-anim`); platformer character
  movement (use `unity-2d-gameplay`); tilemap collision (use `unity-2d-tilemap`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Physics

## Rigidbody2D body types

| Body Type | Behaviour |
|---|---|
| **Dynamic** | Moves under force/gravity/velocity. Most gameplay objects. |
| **Kinematic** | Moves only via `MovePosition`/`MoveRotation`. No automatic forces. Use for player controllers when you handle motion manually. |
| **Static** | Doesn't move. Optimised. Use for terrain, tilemaps. |

```csharp
[RequireComponent(typeof(Rigidbody2D))]
public class Push : MonoBehaviour {
    private Rigidbody2D _rb;
    void Awake() {
        _rb = GetComponent<Rigidbody2D>();
        _rb.interpolation = RigidbodyInterpolation2D.Interpolate;
        _rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;  // critical for fast movers
    }
    public void Push2D(Vector2 dir) => _rb.AddForce(dir * 10f, ForceMode2D.Impulse);
}
```

## Collider2D shapes

`BoxCollider2D`, `CircleCollider2D`, `CapsuleCollider2D`, `EdgeCollider2D` (open polyline), `PolygonCollider2D` (closed shape). Stick to primitives where possible — polygons with many vertices are expensive.

`CompositeCollider2D` merges multiple child colliders into a single optimized shape (standard for tilemap collision).

## Joints

| Joint | Use |
|---|---|
| **Hinge2D** | Doors, windmills, ragdoll limbs |
| **Distance2D** | Two bodies at fixed distance — chains, ropes (with multiple links) |
| **Spring2D** | Bouncy connections — suspension, jelly |
| **Slider2D** | Constrained linear motion — drawers, pistons |
| **Fixed2D** | Glue bodies together until break force |
| **Wheel2D** | Vehicle wheels (suspension + motor) |
| **Target2D** | Move toward a target with damping (mouse drag) |
| **Friction2D** | Dampen relative motion (handy on conveyor return paths) |
| **Relative2D** | Anchor at a relative offset |

## Effectors

Auto-applied behaviours on a collider:

| Effector | Effect |
|---|---|
| **PlatformEffector2D** | One-way platforms, flip-through detection |
| **AreaEffector2D** | Constant force inside the area (wind, water current) |
| **PointEffector2D** | Attract/repel from a point |
| **SurfaceEffector2D** | Conveyor belt — moves objects in contact |
| **BuoyancyEffector2D** | Water buoyancy + drag |

Tag the collider as `Used By Effector` and add the effector component on the same GameObject.

## Layer collision matrix

`Edit > Project Settings > Physics 2D > Layer Collision Matrix`. Cull pairs (`Player`/`Player`, `EnemyProjectile`/`Enemy`) — both correctness and perf.

## Contact filters & queries

```csharp
private static readonly Collider2D[] HitsBuffer = new Collider2D[16];
private ContactFilter2D _filter;

void Awake() {
    _filter = new ContactFilter2D {
        useLayerMask = true,
        layerMask = LayerMask.GetMask("Enemy"),
        useTriggers = false,
    };
}

void Hit() {
    int n = Physics2D.OverlapCircle(transform.position, 0.5f, _filter, HitsBuffer);
    for (int i = 0; i < n; i++) HitsBuffer[i].GetComponent<IDamageable>()?.Damage(10);
}
```

Allocation-free `OverlapCircle/Box/Raycast` overloads avoid GC pressure in hot paths.

## 2D physics gotchas

- **Z position** affects rendering but NOT 2D physics (everything is at z=0 collision-wise).
- **Mass** matters for collision response; tweak via Rigidbody2D Mass (or Auto Mass = ON for density-based).
- **Continuous Collision Detection** — required for high-speed objects (bullets) to avoid tunneling.
- **Simulation Speed**: 50Hz default (FixedUpdate). Higher → smoother + heavier; 30Hz acceptable for casual.
- **Z-axis Job** — physics 2D doesn't run jobs by default; enable in Project Settings → Physics 2D > Use Multithreaded Simulation.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `transform.position` for Rigidbody2D objects | `MovePosition` / set `linearVelocity` in FixedUpdate |
| Polygon collider with hundreds of points | Decompose into primitives or composite |
| Discrete collision on bullets | Continuous CCD |
| Many per-frame `OverlapCircle` allocations | Use NonAlloc / ContactFilter2D overloads |
| Joints with default break force = infinity for breakable links | Set Break Force / Break Torque |
| Effector without `Used By Effector` flag | Tick `Used By Effector` on the collider |

## Production checklist

- [ ] Layer collision matrix culled
- [ ] Static colliders + composite for tilemap-like geometry
- [ ] Continuous detection on fast bodies
- [ ] Allocation-free physics queries in hot paths
- [ ] Joints have realistic break forces
- [ ] Physics 2D substep sufficient for target framerate
