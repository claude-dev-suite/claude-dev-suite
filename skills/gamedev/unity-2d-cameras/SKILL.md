---
name: unity-2d-cameras
description: |
  Unity 2D cameras — Cinemachine 2D (CinemachineCamera, Confiner 2D, Framing
  Transposer, Group Composer), Pixel Perfect Camera, parallax via cameras
  vs sprites, screen shake, target groups, virtual camera priorities.

  USE WHEN: setting up smooth 2D camera follow, framing rules, level-bound
  confiners, dynamic groups (multiple players), screen shake, pixel-perfect
  rendering of camera motion.

  DO NOT USE FOR: 3D Cinemachine (covered separately under unity-rendering /
  unity-physics-anim); UI cameras (use `unity-input-ui`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Cameras

## Cinemachine basics (2D context)

`com.unity.cinemachine` 3.x ships:

- **CinemachineBrain** on your Main Camera — drives blends.
- **CinemachineCamera** (CmCamera in Cinemachine 3) — virtual camera with priority.
- The CmCamera with the highest priority controls the actual camera, with smooth blends in between.

Default 2D follow setup:

```
Main Camera (Orthographic) + CinemachineBrain
└── PlayerFollow (CinemachineCamera)
      Lens > Orthographic + size = 5
      Follow → Player transform
      Body  → Position Composer  (formerly Framing Transposer)
              Tracked Object Offset (0, 1, 0)  (slight upward look)
              Damping X 0.3, Y 0.3
              Dead Zone Width 0.1, Height 0.2
              Soft Zone Width 0.5, Height 0.5
```

Screen position breakdown:
- **Dead Zone** — target inside this rectangle → camera doesn't move.
- **Soft Zone** — target moving here → camera eases to recenter.
- **Outside Soft Zone** — camera tracks immediately.

## Confiner 2D — keep camera inside level bounds

Add `CinemachineConfiner2D` extension to the CmCamera; assign a **PolygonCollider2D** (or CompositeCollider2D) representing the playable area. Camera will never reveal beyond the polygon.

For multi-room games, swap the bounding shape on room change.

## Group framing — multiplayer

```
GroupCenter (CinemachineCamera + GroupComposer body)
   Targets: TargetGroup with [Player1, Player2, Player3]
```

Group composer keeps all members on screen, zooming in/out as they spread.

## Pixel Perfect Camera + Cinemachine

Pixel snapping needs camera position quantized to integer pixel multiples. Cinemachine 3 + Pixel Perfect Camera require:

```
On the Cinemachine Brain GameObject (Main Camera):
  Add CinemachinePixelPerfect extension at the brain level (Cinemachine 3)
  OR
  Use CinemachineConfiner2D + Pixel Perfect Camera component on Main Camera (older approach)
```

Without it, camera follow jitters at sub-pixel level when the target moves slowly.

## Parallax — two approaches

### A. Multiple cameras

Each background layer has its own camera with a different orthographic size or stacked render. Heavier but pixel-perfect.

### B. Sprite-based parallax (lighter — recommended)

```csharp
public class ParallaxLayer : MonoBehaviour {
    [SerializeField] private Transform cam;
    [SerializeField, Range(0f, 1f)] private float multiplier = 0.5f;
    private Vector3 _start;
    private Vector3 _camStart;
    void Start() { _start = transform.position; _camStart = cam.position; }
    void LateUpdate() {
        var delta = cam.position - _camStart;
        transform.position = _start + new Vector3(delta.x * multiplier, delta.y * multiplier, 0);
    }
}
```

Multiplier 0 = sticks to player, 1 = world-locked. Stack layers from `0.1` (far sky) to `0.9` (near foreground).

## Screen shake (Cinemachine Impulse)

```csharp
[SerializeField] private CinemachineImpulseSource impulse;
public void OnExplosion() => impulse.GenerateImpulseAtPositionWithVelocity(
    transform.position, Random.insideUnitSphere * 1.5f);
```

CmCamera has a `CinemachineImpulseListener` extension → reacts to all impulses in range. Tune by **signal asset** (frequency, amplitude, duration).

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Hard-coded camera follow on Update | Cinemachine CmCamera + Position Composer |
| Manual clamping per scene | Confiner 2D |
| Pixel jitter on slow camera moves | Pixel Perfect + CinemachinePixelPerfect extension |
| Per-frame `Camera.main` refs | Cache `Camera.main` once OR get from CinemachineBrain |
| Many parallax layers each with their own camera | Sprite-based parallax LateUpdate |
| Screen shake by writing camera position | Use Impulse Source/Listener |

## Production checklist

- [ ] Main Camera has CinemachineBrain
- [ ] One CmCamera per gameplay state (gameplay, dialogue, cinematic)
- [ ] Confiner 2D assigned per playable area
- [ ] Pixel Perfect (if pixel art) integrated with Cinemachine
- [ ] Parallax layers configured
- [ ] Screen shake via Impulse — no manual position writes
- [ ] Camera priorities documented
