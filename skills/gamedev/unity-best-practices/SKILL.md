---
name: unity-best-practices
description: |
  Unity project conventions — folder layout, asmdef structure, naming, source
  control (.gitignore + LFS + force text serialization), prefab variants,
  ScriptableObject-based architecture.

  USE WHEN: starting a new Unity project, refactoring an unhealthy one,
  setting up source control, organising assets, deciding on naming.

  DO NOT USE FOR: specific systems (use feature-specific skills).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Best Practices

## Folder layout (recommended)

```
Assets/
  _Project/                  ← all our content (lead underscore sorts first)
    Art/
      Models/  Sprites/  Materials/  Shaders/  Animations/
    Audio/
      Music/  SFX/
    Prefabs/
      Characters/  Enemies/  UI/  VFX/
    ScriptableObjects/
      WeaponData/  EnemyConfig/  EventChannels/
    Scenes/
      Boot.unity  Main.unity  ...
    Scripts/
      Runtime.asmdef  (game logic)
      Editor.asmdef   (editor tools)
      Tests.asmdef    (tests, Test Assemblies)
    Settings/             (Render Pipeline asset, Volume profiles, Input Actions)
  Plugins/                  ← third-party packages (DOTween, etc.)
  StreamingAssets/          ← runtime-readable raw files
ProjectSettings/            ← committed
Packages/                   ← committed (manifest.json + lock)
```

`_Project/` keeps your content separated from imported packages.

## Asmdef structure

Three asmdefs minimum:
1. **Runtime** — game code, no `UnityEditor` references.
2. **Editor** — depends on Runtime + UnityEditor, Include Platforms = Editor only.
3. **Tests** — depends on Runtime (and Editor for editor tests), Test Assemblies flag enabled.

Bigger projects: feature-level asmdefs (`Combat.Runtime`, `Inventory.Runtime`) — speeds up incremental compile dramatically.

## Naming

| Element | Convention |
|---|---|
| Type / class | PascalCase |
| Method / property | PascalCase |
| Public field (rare) | PascalCase |
| Private field | `_camelCase` |
| Const | UPPER_SNAKE |
| Asset (prefab, SO) | PascalCase, no spaces |
| Folder | PascalCase |

## Inspector exposure

```csharp
// Wrong
public WeaponData weapon;

// Right
[SerializeField] private WeaponData weapon;
public WeaponData Weapon => weapon;
```

`[SerializeField] private` keeps API surface minimal while still letting designers wire references.

## Source control

`.gitignore`:

```
Library/
Temp/
Logs/
Build/
UserSettings/
.vs/
.vscode/
*.csproj
*.sln
sysinfo.txt
[Mm]emoryCaptures/
[Bb]uilds/
```

`.gitattributes` (Git LFS):

```
*.psd      filter=lfs diff=lfs merge=lfs -text
*.fbx      filter=lfs diff=lfs merge=lfs -text
*.png      filter=lfs diff=lfs merge=lfs -text
*.wav      filter=lfs diff=lfs merge=lfs -text
*.ogg      filter=lfs diff=lfs merge=lfs -text
*.mp4      filter=lfs diff=lfs merge=lfs -text
*.unity    -text merge=unityyamlmerge
*.prefab   -text merge=unityyamlmerge
*.asset    -text merge=unityyamlmerge
*.mat      -text merge=unityyamlmerge
*.anim     -text merge=unityyamlmerge
```

Editor settings: **Force Text** asset serialization, **Visible Meta Files** mode (default in Unity 6).

## Prefab Variants

When you need variants of a base (Enemy → Enemy_Boss with bigger HP and a unique mesh): right-click prefab → **Create > Prefab Variant**. Override only the differing fields; everything else cascades from the base.

## ScriptableObject-driven architecture

Decouple via SO event channels:

```csharp
[CreateAssetMenu(menuName = "Events/Int Event")]
public class IntEventChannel : ScriptableObject {
    public event Action<int> OnRaised;
    public void Raise(int value) => OnRaised?.Invoke(value);
}
```

Enemy raises a `playerDamaged` channel; HUD listens to it. No direct reference between systems → trivial to test, easy to swap.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Singleton tangle (every system has `Instance`) | SO event channels + dependency injection in Awake |
| Massive Manager classes | Split by responsibility; thin orchestrator + dedicated systems |
| Unstructured `Assets/` (everything in root) | Adopt the layout above |
| Relying on Build Settings scene order at runtime | Load via Addressables or explicit `SceneManager.LoadScene(name)` with constants |
| Public fields everywhere | `[SerializeField] private` + properties |

## Production checklist

- [ ] `_Project/` content separated from packages
- [ ] Three asmdefs minimum (Runtime / Editor / Tests)
- [ ] `.gitignore` + `.gitattributes` (LFS) committed
- [ ] Force Text serialization on
- [ ] Naming conventions enforced (lint via Roslyn analyzer if possible)
- [ ] No singletons in new code; SO event channels for cross-system events
- [ ] Boot scene loads required systems explicitly (no auto-Find)
