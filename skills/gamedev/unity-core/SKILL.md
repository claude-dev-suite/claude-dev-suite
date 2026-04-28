---
name: unity-core
description: |
  Unity core scripting fundamentals — MonoBehaviour lifecycle, GameObject /
  Component model, ScriptableObjects, prefabs, serialization, coroutines,
  events, and execution order.

  USE WHEN: writing or refactoring core Unity scripts, designing data flow,
  setting up ScriptableObjects, dealing with serialization issues, choosing
  between Update / FixedUpdate / LateUpdate, coroutine vs async patterns.

  DO NOT USE FOR: rendering / shaders (use `unity-rendering`); 2D-specific
  topics (use `unity-2d-*`); networking (use `unity-netcode`); ECS/DOTS
  (use `unity-dots`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Core

## MonoBehaviour Lifecycle

```
Awake          → once, per script instance, even if disabled
OnEnable       → each time GameObject/component becomes active
Start          → once, just before first Update, only if active
FixedUpdate    → fixed timestep (default 0.02s); physics writes here
Update         → every frame
LateUpdate     → after all Update; camera follow, IK adjustments
OnDisable      → when component/GO becomes inactive
OnDestroy      → when component/GO is destroyed (or app quits)
```

Order across objects: `Awake`/`OnEnable` for ALL objects, then `Start` for ALL, then per-frame loops. Tweak per-script via Edit > Project Settings > Script Execution Order — sparingly.

## ScriptableObject — data assets

```csharp
[CreateAssetMenu(menuName = "Game/Weapon", fileName = "NewWeapon")]
public class WeaponData : ScriptableObject {
    public string displayName;
    [Min(0)] public int damage = 10;
    [Range(0f, 5f)] public float fireRate = 0.5f;
    public Sprite icon;
    public AudioClip fireSfx;
}
```

Use them for: tuning data, configurable enemy stats, level definitions, event channels. Avoid them as runtime mutable singletons across scenes — values persist in editor between play sessions.

## Reference injection (no Find)

```csharp
public class Enemy : MonoBehaviour {
    [SerializeField] private WeaponData weapon;     // assigned in inspector
    [SerializeField] private Transform target;       // explicit dependency

    private Rigidbody _rb;                           // cached own component
    private void Awake() => _rb = GetComponent<Rigidbody>();
}
```

Never: `GameObject.Find`, `FindObjectOfType` in Update. Acceptable: once in Awake/Start when injection isn't possible (rare).

## Coroutines vs async

| Use case | Pick |
|----------|------|
| Wait one frame / WaitForSeconds / WaitForFixedUpdate | Coroutine — `IEnumerator` + `yield return` |
| HTTP / file IO / long async ops | `async UniTask` (UniTask package) or `async Task` with `WhenAll` |
| Cancellation / structured concurrency | UniTask + CancellationToken |
| Cross-platform WebGL | Coroutines (no real threads) or UniTask |

```csharp
private Coroutine _flashRoutine;
private IEnumerator FlashRoutine() {
    var renderer = GetComponent<Renderer>();
    var original = renderer.material.color;
    for (int i = 0; i < 3; i++) {
        renderer.material.color = Color.red;
        yield return new WaitForSeconds(0.1f);
        renderer.material.color = original;
        yield return new WaitForSeconds(0.1f);
    }
    _flashRoutine = null;
}

public void Flash() {
    if (_flashRoutine != null) StopCoroutine(_flashRoutine);
    _flashRoutine = StartCoroutine(FlashRoutine());
}
```

## Events — UnityEvent vs C# event vs ScriptableObject channel

| Style | When |
|-------|------|
| `C# event Action<T>` | Internal cross-script communication, no inspector wiring |
| `UnityEvent<T>` | Inspector-bound callbacks; designer-friendly |
| ScriptableObject event channel | Decoupling across scenes / between systems with no direct reference |

## Serialization rules

- `[SerializeField] private` over `public` for inspector exposure.
- Lists/arrays of references serialize fine; cyclic references via `[SerializeReference]` only when needed (heavier).
- `Dictionary<TK,TV>` does NOT serialize — use parallel `List<TK>`+`List<TV>` or `SerializableDictionary` packages.
- For polymorphic data (e.g. behaviour trees), use `[SerializeReference]` + interfaces.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Logic on every Update | Throttle with `if (Time.frameCount % N == 0)` or events |
| `Camera.main` in Update | Cache once in Awake (`_mainCam = Camera.main;`) |
| `transform.position` writes inside FixedUpdate without Rigidbody | Use `rb.MovePosition`, never `transform.position` for physics objects |
| Singleton MonoBehaviour with `Instance` accessed before Awake | Move init to `Awake`; use `RuntimeInitializeOnLoadMethod` for boot logic |
| Public mutable fields | `[SerializeField] private` + property |

## Production checklist

- [ ] Asmdefs split runtime / editor / test
- [ ] No `Find*` calls in hot paths
- [ ] All physics writes in FixedUpdate
- [ ] ScriptableObjects used for tuning data
- [ ] String hashes cached for Animator parameters
- [ ] Events disposed in OnDisable / OnDestroy
- [ ] Coroutines stopped on disable to avoid orphan loops
