---
name: unity-editor-tooling
description: |
  Unity Editor scripting — custom Inspectors, PropertyDrawers, EditorWindow,
  MenuItems, asset post-processors, Editor Coroutines, automated builds via
  `-batchmode -executeMethod`.

  USE WHEN: building tools for designers, custom Inspector UI, gizmos, scene
  validators, asset import hooks, editor menu commands, headless CI builds.

  DO NOT USE FOR: runtime UI (use `unity-input-ui`); test runner (use
  `unity-testing`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Editor Tooling

## Asmdef layout for editor code

```
Assets/
  Scripts/
    Runtime.asmdef          (no editor refs)
    Editor.asmdef           (Include Platforms = Editor only)
      depends on Runtime + UnityEditor
```

Editor code never ships in player builds — keep it isolated.

## Custom Inspector

```csharp
[CustomEditor(typeof(EnemySpawner))]
public class EnemySpawnerEditor : Editor {
    public override void OnInspectorGUI() {
        DrawDefaultInspector();

        var spawner = (EnemySpawner)target;
        EditorGUILayout.Space();
        if (GUILayout.Button("Spawn Test Wave")) {
            if (Application.isPlaying) spawner.SpawnTestWave();
            else Debug.LogWarning("Enter Play Mode first.");
        }
    }
}
```

Prefer **UI Toolkit Inspectors** (UXML/USS) for complex tools — better composition than IMGUI.

## PropertyDrawer

```csharp
[CustomPropertyDrawer(typeof(MinMaxRangeAttribute))]
public class MinMaxRangeDrawer : PropertyDrawer {
    public override void OnGUI(Rect r, SerializedProperty p, GUIContent l) {
        var attr = (MinMaxRangeAttribute)attribute;
        var min = p.FindPropertyRelative("min");
        var max = p.FindPropertyRelative("max");
        EditorGUI.MinMaxSlider(r, l, ref min.floatValue, ref max.floatValue, attr.Min, attr.Max);
    }
}
```

## EditorWindow

```csharp
public class LevelToolsWindow : EditorWindow {
    [MenuItem("Tools/Level Tools")]
    public static void Show() => GetWindow<LevelToolsWindow>("Level Tools");

    private void OnGUI() {
        if (GUILayout.Button("Bake Lighting")) Lightmapping.BakeAsync();
        if (GUILayout.Button("Validate Scene")) ValidateActiveScene();
    }
}
```

## Asset post-processor

Auto-fix import settings for new sprites:

```csharp
public class SpriteImporter : AssetPostprocessor {
    void OnPreprocessTexture() {
        if (!assetPath.Contains("/Sprites/")) return;
        var ti = (TextureImporter)assetImporter;
        ti.textureType = TextureImporterType.Sprite;
        ti.spritePixelsPerUnit = 32;
        ti.filterMode = FilterMode.Point;
        ti.textureCompression = TextureImporterCompression.Uncompressed;
    }
}
```

## Headless builds (`-batchmode`)

```csharp
public static class CIBuild {
    [MenuItem("Build/Build Windows")]
    public static void BuildWindows() {
        var opts = new BuildPlayerOptions {
            scenes = new[] { "Assets/Scenes/Boot.unity", "Assets/Scenes/Main.unity" },
            locationPathName = "Build/Win64/Game.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None,
        };
        var report = BuildPipeline.BuildPlayer(opts);
        if (report.summary.result != BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }
}
```

CI invocation:

```bash
Unity -batchmode -nographics -quit \
  -projectPath . \
  -executeMethod CIBuild.BuildWindows \
  -logFile -
```

Combine with **Addressables.BuildPlayerContent()** before player build to prep content.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Editor code mixed in Runtime asmdef | Split asmdef; gate with `#if UNITY_EDITOR` for one-offs |
| Heavy logic in OnInspectorGUI | Cache, only recompute on `EditorUtility.SetDirty` events |
| `EditorPrefs` for project-shared state | Use `ProjectSettings` or assets in repo |
| Reflection-driven Inspectors with no fallback | Always provide DrawDefaultInspector path |

## Production checklist

- [ ] All custom tools have menu entries under `Tools/` namespace
- [ ] Asset post-processors enforce import settings (sprites, audio, models)
- [ ] CI builds run via `-batchmode -executeMethod`
- [ ] Editor analytics (`Analytics.RegisterEvent`) opt-in only, scrubbed of PII
- [ ] Editor coroutines used for long-running tools (don't freeze UI)
