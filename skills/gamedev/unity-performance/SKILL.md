---
name: unity-performance
description: |
  Unity performance — Profiler, Frame Debugger, Memory Profiler, GC allocation
  hunting, object pooling, IL2CPP build settings, Burst, batching, LOD, GPU
  Resident Drawer.

  USE WHEN: frame drops, GC spikes, long load times, memory growth, draw-call
  storms, mobile thermal/battery issues, profiling captures.

  DO NOT USE FOR: gameplay logic refactoring (use `unity-core`); pipeline
  selection (use `unity-rendering`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Performance

## Tools

- **Profiler** (Window > Analysis > Profiler): CPU / GPU / Memory / Rendering / Audio / Physics.
- **Frame Debugger** (Window > Analysis > Frame Debugger): step through draw calls, see batching breaks.
- **Memory Profiler package**: snapshots, diff, find leaks.
- **Profile Analyzer package**: aggregate frames across captures.
- Use **Deep Profile** sparingly — adds overhead but shows method-level hotspots.

## Build for profiling

Make a **Development Build** with **Autoconnect Profiler** + **Deep Profiling Support**. Don't profile editor — numbers are misleading.

## GC allocation hunting

Common culprits:

| Cause | Fix |
|---|---|
| `string` concatenation in Update | `StringBuilder` reused, or only build when value changes |
| `List<T>.ToArray()` per frame | Cache list, reuse |
| `foreach` over some collections (boxing) | `for` loop over `IList<T>` |
| `GetComponent` in Update | Cache in Awake |
| LINQ (`.Where`, `.Select`) per frame | Manual loops |
| Lambda capturing locals | Convert to method or pre-allocate delegate |

Read GC Alloc column in Profiler hierarchy — anything > 0 in Update is suspect.

## Object pooling

```csharp
private readonly IObjectPool<Bullet> _pool = new ObjectPool<Bullet>(
    createFunc:    () => Object.Instantiate(prefab),
    actionOnGet:   b => b.gameObject.SetActive(true),
    actionOnRelease: b => b.gameObject.SetActive(false),
    actionOnDestroy: Object.Destroy,
    defaultCapacity: 32, maxSize: 256);

public void Fire() {
    var b = _pool.Get();
    b.transform.position = muzzle.position;
    b.OnExpired = () => _pool.Release(b);
}
```

`UnityEngine.Pool.ObjectPool<T>` since Unity 2021.1. For SO-driven pools or ECS, use NativeArray-backed structures.

## Burst + Jobs

```csharp
[BurstCompile]
public struct ApplyGravityJob : IJobParallelFor {
    public NativeArray<float3> Velocities;
    public float DeltaTime;
    public void Execute(int i) {
        Velocities[i] += new float3(0, -9.81f * DeltaTime, 0);
    }
}

void Update() {
    var job = new ApplyGravityJob { Velocities = _velocities, DeltaTime = Time.deltaTime };
    var handle = job.Schedule(_velocities.Length, 64);
    handle.Complete();
}
```

Burst compiles to highly optimized native; works only on `struct` jobs with `NativeArray`/blittable types.

## IL2CPP build settings

- **IL2CPP Code Generation**: "Faster runtime" for shipping; "Faster (smaller) builds" for iteration.
- **Managed Stripping Level**: Low/Medium for safety; High only with thorough QA + `link.xml` for reflection-only types.
- **Engine Code Stripping**: enable to drop unused subsystems.

## Batching & instancing

| Technique | When |
|---|---|
| Static Batching | Mark static + same material → bake at build |
| Dynamic Batching | Auto for very small meshes; off in URP by default |
| GPU Instancing | Same mesh + same shader, slight per-instance variation via MaterialPropertyBlock |
| SRP Batcher | URP/HDRP default — same shader variant batched into one SetPass |
| GPU Resident Drawer (Unity 6) | Auto-instancing for static objects with shared mesh+mat |

## LOD

```
LOD 0 = full mesh (close)
LOD 1 = half tris (medium)
LOD 2 = quarter tris (far)
LOD 3 = imposter or culled
```

Use `LODGroup` with screen-relative transition heights. Combine with Occlusion Culling for indoors.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Profiling editor numbers | Profile Development Build only |
| `Camera.main` per frame | Cache once |
| `new Vector3(...)` in Update with constants | Make `static readonly` |
| `transform.GetChild(i).gameObject` repeatedly | Cache child references |
| Per-frame `string.Format` for HUD text | Update only on value change |
| Profiler with deep profile shipped to QA | Only enable for short investigations |

## Production checklist

- [ ] Frame budget hit on target devices (e.g. 16ms PC, 33ms mobile)
- [ ] GC alloc per frame ≤ ~0 in steady state
- [ ] Object pools for bullets/VFX/UI fly-outs
- [ ] Burst-compiled jobs for hot math
- [ ] LODGroup + Occlusion Culling tuned
- [ ] Shader variants pre-warmed
- [ ] Memory snapshot baseline + post-soak captured & diffed
