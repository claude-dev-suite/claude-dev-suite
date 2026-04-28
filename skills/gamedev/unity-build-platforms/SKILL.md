---
name: unity-build-platforms
description: |
  Unity builds — IL2CPP vs Mono, build profiles, addressables-aware builds,
  Android (Gradle, AAB, Play Asset Delivery), iOS (Xcode post-processing,
  capabilities), WebGL, console NDA paths (high-level only).

  USE WHEN: configuring build settings, fixing platform-specific issues,
  signing, store submission, build size optimization, multi-platform CI.

  DO NOT USE FOR: editor-side build code (use `unity-editor-tooling`); runtime
  perf (use `unity-performance`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Builds & Platforms

## Scripting backend

| Backend | Where | Trade-off |
|---|---|---|
| **IL2CPP** | All shipping builds | AOT-compiled, smaller perf surprises, slow build, larger binary |
| **Mono** | Editor + dev iteration | Fast build, dynamic features, larger memory, JIT not allowed on iOS |

Ship IL2CPP for production on every platform that supports it.

## Build profiles (Unity 6)

`Window > Build Profiles` — distinct configs per target (development PC, release PC, mobile dev, mobile release). Each profile has its own scripting backend, scenes list, scripting defines, and build path.

## Android

### Gradle + libraries

`Assets/Plugins/Android/` for AAR/JAR drops. Use **Custom Main Manifest / Custom Gradle Properties** when third-party SDKs need them — avoid editing `Library/` generated files.

### AAB (App Bundle)

Mandatory on Play Store since 2021. Configure:
- Minimum API level (typically 26+)
- Target API level (latest stable)
- Architectures: **ARM64 only** for shipping (x86 is dev-only)
- IL2CPP Code Generation: Faster runtime
- **Strip Engine Code = ON**

### Play Asset Delivery (PAD)

Splits content into install-time / fast-follow / on-demand asset packs. Pair with Addressables: configure remote group → builds into `.aab` asset packs. Use for big games (>150 MB base APK limit).

### Permissions

Declare only what you use; runtime-request location/camera/mic. Recent Android requires `Manifest.permission.POST_NOTIFICATIONS` for push.

## iOS

### Build flow

Unity → Xcode project → archive → notarize/upload via Xcode or `altool`. Most issues come from **Build Phases** missing entitlements; fix via `OnPostprocessBuild`:

```csharp
[PostProcessBuild]
public static void Modify(BuildTarget t, string path) {
    if (t != BuildTarget.iOS) return;
    var pbx = new PBXProject();
    var pbxPath = PBXProject.GetPBXProjectPath(path);
    pbx.ReadFromFile(pbxPath);
    string targetGuid = pbx.GetUnityMainTargetGuid();
    pbx.AddFrameworkToProject(targetGuid, "UserNotifications.framework", false);
    pbx.WriteToFile(pbxPath);
}
```

### Capabilities & Info.plist

Push (`UserNotifications`), Sign in with Apple, Game Center, IAP — via Capabilities. Privacy strings (`NSCameraUsageDescription`) — must explain user-visible reason.

## WebGL

Constraints:
- No real threads (until SharedArrayBuffer is fully unlocked)
- Memory cap (usually 256–512 MB; configure in Player Settings)
- Compression: **Brotli** when server supports it; **Gzip** otherwise; **Disabled** only for itch.io-style hosts that decompress for you

Disable: bloom (heavy), realtime shadows (gather), reflection probes if static.

## Console (PS5/XSX/Switch)

Behind NDA. High-level: separate Unity install per platform; console-specific Build Pipeline calls; first-party libs (PSN/Xbox Live/Nintendo Account) wrap their own SDK on top of Unity. Get developer account + Unity console license before scoping.

## CI for multi-platform

```yaml
# pseudo-yaml: matrix over platforms
strategy:
  matrix:
    target: [StandaloneWindows64, Android, iOS]
steps:
  - uses: game-ci/unity-builder@v4
    with:
      targetPlatform: ${{ matrix.target }}
      buildMethod: CIBuild.Build
```

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Mono on shipping mobile | IL2CPP + ARM64 |
| Engine code stripping disabled | Enable High; add `link.xml` for reflection types |
| Forgotten dev provisioning profile | Use distribution profile in Release builds |
| Big base APK exceeding 150 MB | PAD asset packs + Addressables |
| WebGL gzip on a host that doesn't decompress | Brotli or Disabled compression |
| Same scripting defines across all platforms | Per-platform defines in Build Profiles |

## Production checklist

- [ ] Build Profiles configured per target
- [ ] Signing keys stored securely (GitHub secrets, not committed)
- [ ] Minimum/target SDK / iOS deployment target documented
- [ ] Addressables built before player on every platform
- [ ] Platform-specific permissions strings + capabilities reviewed
- [ ] Build size budget tracked over time (alert on regressions)
- [ ] Day-1 patch / fast-follow path tested
