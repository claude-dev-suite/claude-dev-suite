---
name: unity-rendering
description: |
  Unity rendering pipelines (Built-in / URP / HDRP), Shader Graph, Renderer
  Features, Volume framework, post-processing, materials, lighting, and GPU
  Resident Drawer.

  USE WHEN: choosing or migrating rendering pipeline, writing/editing shaders
  (Shader Graph, HLSL, ShaderLab), tuning lighting, debugging draw calls,
  configuring Volume profiles, custom render passes.

  DO NOT USE FOR: 2D Renderer specifics (use `unity-2d-lighting`); UI Toolkit
  rendering (use `unity-input-ui`); profiling-only questions (use
  `unity-performance`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Rendering

## Pipeline selection

| Pipeline | Use when | Avoid when |
|---|---|---|
| **URP** | Mobile, indie, mid-fidelity, broad platform reach, custom Renderer Features | Cinematic AAA, volumetrics, screen-space GI |
| **HDRP** | High-end PC/console, photoreal, advanced lighting | Mobile, WebGL, low-spec hardware |
| **Built-in** | Legacy projects, very specific shaders not portable | New projects (default to URP) |

Switching pipeline mid-project is painful — pick once, upfront.

## Shader Graph (URP/HDRP)

```
Vertex stage  → object-space → world-space transforms, vertex displacement
Fragment      → albedo, normal, metallic, smoothness, emission, AO
Custom Function node → write HLSL inline for branchless ops
Subgraph      → reusable groups; export as .shadersubgraph
```

Author URP shaders in Shader Graph by default. Drop to handwritten ShaderLab/HLSL only when SG can't express the math (e.g. compute, geometry, custom render textures).

## Volume framework (URP/HDRP)

```csharp
// Per-camera profile override
var volume = camera.GetComponent<Volume>();
if (volume.profile.TryGet<Bloom>(out var bloom)) {
    bloom.intensity.value = 1.5f;
    bloom.threshold.value = 0.9f;
}
```

Global volume + per-trigger local volumes; use weights for smooth transitions (e.g. entering interior).

## Renderer Features (URP)

Add custom passes (outline, fog, decal) by extending `ScriptableRendererFeature` + `ScriptableRenderPass`. Inject at `BeforeRenderingTransparents`, `AfterRenderingPostProcessing`, etc.

```csharp
public class OutlineFeature : ScriptableRendererFeature {
    public Material outlineMat;
    OutlinePass _pass;
    public override void Create() => _pass = new OutlinePass(outlineMat);
    public override void AddRenderPasses(ScriptableRenderer r, ref RenderingData d)
        => r.EnqueuePass(_pass);
}
```

## GPU Resident Drawer / BatchRendererGroup (Unity 6)

Big draw-call wins for static + lots of instances. Toggle GPU Resident Drawer in Quality settings; objects must be **Static** + share materials/meshes; auto-instances them on the GPU.

## Lighting

| Need | Use |
|---|---|
| Static scenes (level geo) | Baked Global Illumination (Progressive Lightmapper GPU) + Light Probes for dynamic objects |
| Outdoor day-night cycle | Mixed lighting (Shadowmask) + dynamic skybox |
| Stylized cel-shading | Custom Shader Graph with ramp texture |
| HDRP photoreal | Volumetric lights + Screen-Space GI + Adaptive Probe Volumes |

Reflection Probes: bake on key viewpoints; use box projection for indoors; pure realtime probes only for hero objects.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Different shader per material variant | Material Property Block via `Renderer.SetPropertyBlock` |
| Switching shaders at runtime | Pre-warm with shader variants collection asset |
| Per-frame material instantiation | `renderer.material` clones — use `sharedMaterial` for reads, `MaterialPropertyBlock` for per-instance overrides |
| Camera.Render() in Update | Use Render Texture + `Camera.targetTexture` once |
| Mixing pipelines (URP shader on Built-in) | Convert via `Edit > Render Pipeline > Universal > Convert Selected Materials` |

## Production checklist

- [ ] Pipeline asset set in Graphics + Quality settings
- [ ] Volume profiles configured for global + relevant local triggers
- [ ] Shader variants collection generated and preloaded for the build
- [ ] Static objects flagged Static; lighting baked
- [ ] Light Probes / Reflection Probes placed
- [ ] Frame Debugger inspected — no surprise opaque draws on UI
- [ ] HDRP-only: Adaptive Probe Volumes configured if static GI is critical
