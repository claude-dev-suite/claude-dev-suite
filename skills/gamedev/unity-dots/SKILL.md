---
name: unity-dots
description: |
  Unity DOTS — Entities 1.x, Burst-compiled jobs, IJobChunk / IJobEntity,
  NativeArray / NativeList, SystemBase vs ISystem, baking GameObject to
  entity, hybrid components.

  USE WHEN: massive entity counts (RTS, swarms, particles-as-entities),
  data-oriented refactor of hot simulations, deterministic netcode targets,
  Burst-friendly math.

  DO NOT USE FOR: regular GameObject gameplay (use `unity-core`); rendering
  (DOTS uses Entities Graphics — link from `unity-rendering`); networking
  with NGO (use `unity-netcode`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity DOTS / ECS (Entities 1.x)

## When (and when not)

DOTS shines with **lots of similar things** doing **lots of similar work**: 10k+ units, particle-as-entity sim, deterministic physics for netcode. For typical character-based gameplay (a player, ~10 enemies, UI) classic GameObjects + MonoBehaviour are simpler and fast enough.

Mixing both: hybrid mode — GameObjects for hero/UI, ECS for swarms.

## Components

```csharp
public struct Position : IComponentData { public float3 Value; }
public struct Velocity : IComponentData { public float3 Value; }
public struct Health   : IComponentData { public float Value; }
public struct Enemy    : IComponentData {} // tag

public struct Inventory : IBufferElementData {     // dynamic buffer
    public Entity Item;
    public int    Count;
}
```

All `IComponentData` are blittable structs (no reference types directly).

## Systems — ISystem (preferred over SystemBase for Burst)

```csharp
[BurstCompile]
public partial struct MoveSystem : ISystem {
    public void OnUpdate(ref SystemState state) {
        float dt = SystemAPI.Time.DeltaTime;
        new MoveJob { DeltaTime = dt }.ScheduleParallel();
    }
}

[BurstCompile]
public partial struct MoveJob : IJobEntity {
    public float DeltaTime;
    void Execute(ref Position pos, in Velocity vel) {
        pos.Value += vel.Value * DeltaTime;
    }
}
```

`partial struct` lets Unity generate the iteration boilerplate at compile time.

## Querying

```csharp
foreach (var (transform, velocity) in
         SystemAPI.Query<RefRW<Position>, RefRO<Velocity>>().WithAll<Enemy>()) {
    transform.ValueRW.Value += velocity.ValueRO.Value * dt;
}
```

`RefRW` = read/write, `RefRO` = read-only (better job scheduling).

## Baking — GameObject → Entity

```csharp
public class EnemyAuthoring : MonoBehaviour {
    public float Speed;
}
public class EnemyBaker : Baker<EnemyAuthoring> {
    public override void Bake(EnemyAuthoring authoring) {
        var e = GetEntity(TransformUsageFlags.Dynamic);
        AddComponent(e, new Velocity { Value = new float3(0, 0, authoring.Speed) });
        AddComponent<Enemy>(e);
    }
}
```

Designers tweak in Inspector; baking turns Authoring components into Entity components at subscene conversion time.

## Sub Scenes

Big static worlds → put in a SubScene asset, baked offline → loaded by streaming. Smaller content/dynamic spawning → spawn at runtime via `EntityManager.CreateEntity`.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Storing Entity references in `class` MonoBehaviour | Use bridge ScriptableObject + lookup, or hybrid component |
| `EntityManager.CreateEntity` per frame from main thread | Use `EntityCommandBuffer.ParallelWriter` from a job |
| Mixing managed types in IComponentData | Use `IComponentData` blittable + companion class component if absolutely needed |
| Forgetting Burst attribute | `[BurstCompile]` on systems & jobs — verify in Burst Inspector |
| Heavy `EntityQuery` per frame | Cache via `state.GetEntityQuery` in OnCreate |

## Production checklist

- [ ] DOTS used only where it beats GameObject perf measurably
- [ ] All hot systems Burst-compiled
- [ ] EntityCommandBuffer used for structural changes
- [ ] SubScenes for static content
- [ ] Authoring components reviewed by designers
- [ ] Determinism verified if ECS feeds netcode
