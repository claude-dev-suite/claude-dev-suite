---
name: unity-addressables
description: |
  Unity Addressables — AssetReference, async loading, labels, groups, build
  profiles, remote content, Cloud Content Delivery integration, content
  catalogs and updates.

  USE WHEN: replacing `Resources.Load`, async asset loading, scene streaming,
  remote content, DLC delivery, runtime asset hot-swap, splitting builds for
  size.

  DO NOT USE FOR: editor-time asset queries (use AssetDatabase); legacy Asset
  Bundles workflows (Addressables wraps them).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Addressables

## Why Addressables (vs Resources / direct refs)

- `Resources/` includes everything in build → forces every asset in memory.
- Direct prefab references → load immediately with the scene.
- Addressables: lazy, async, remote-capable, content-update-friendly.

## AssetReference

```csharp
public class EnemySpawner : MonoBehaviour {
    [SerializeField] private AssetReferenceGameObject enemyPrefab;
    [SerializeField] private Transform spawnPoint;

    public async void Spawn() {
        AsyncOperationHandle<GameObject> handle =
            enemyPrefab.InstantiateAsync(spawnPoint.position, Quaternion.identity);
        var enemy = await handle.Task;
        // listen for destroy → release
        enemy.GetComponent<Enemy>().Killed += () => Addressables.ReleaseInstance(enemy);
    }
}
```

`InstantiateAsync` reference-counts; release with `ReleaseInstance` to free memory.

## Loading by label

```csharp
var handle = Addressables.LoadAssetsAsync<AudioClip>("music", null);
var clips = await handle.Task;        // all assets with label 'music'
// later
Addressables.Release(handle);
```

## Build profiles

- **Development** — local groups, fast iteration.
- **Release** — remote groups (CDN URL), packed bundles.

Set in `Window > Asset Management > Addressables > Profiles`. CI builds invoke `Addressables.BuildPlayerContent()` or `AddressablesPlayerBuildResult`.

## Content updates (without rebuilding the player)

1. Mark a group as **Content Update Restriction = Can Change Post Release**.
2. Build content → produces `addressables_content_state.bin` (commit).
3. Later, `Build > Update a Previous Build` → produces incremental bundles → upload to CDN. Player downloads the new catalog on launch.

## Cloud Content Delivery (Unity Gaming Services)

- Bucket per environment (dev/staging/prod).
- Badge tags ("release-1.2") to pin clients to specific releases.
- Authentication via UGS for entitled content.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `Resources.Load` for big asset graphs | Migrate to Addressables |
| Forgetting to `Release` | Reference-count leaks → run Profiler memory snapshot regularly |
| Massive single group | Split by usage (per-level, per-language, music vs SFX) |
| Sync `WaitForCompletion` on remote loads | Always async; show loading UI |
| Different bundle compression per platform forgotten | Default LZ4 for all desktop/mobile; Uncompressed for WebGL on tiny assets |

## Production checklist

- [ ] No `Resources/` folders left in production code paths
- [ ] Groups split by load pattern
- [ ] Labels used for batch loads (music, vfx-rare, boss-only)
- [ ] CDN URL profile-driven, not hardcoded
- [ ] `addressables_content_state.bin` checked into git
- [ ] CI builds Addressables before player build
- [ ] Memory profiler shows expected residency after scene load
