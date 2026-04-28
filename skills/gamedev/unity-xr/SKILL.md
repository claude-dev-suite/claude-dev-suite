---
name: unity-xr
description: |
  Unity XR — XR Interaction Toolkit 3.x (Interactor/Interactable/Manipulation),
  AR Foundation (planes, anchors, image tracking, body tracking), OpenXR, hand
  tracking on Quest/Vision OS.

  USE WHEN: VR/AR/MR projects, integrating XR controllers, AR plane detection,
  XR locomotion, hand tracking, eye tracking, OpenXR features.

  DO NOT USE FOR: regular 3D gameplay (use `unity-physics-anim`); rendering
  pipeline (use `unity-rendering` — XR has URP-specific considerations).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity XR

## Stack overview

```
                  XR Interaction Toolkit (input + interaction)
                                  ↑
                          XR Plug-in Management
                          ↙           ↘
                    OpenXR        ARKit / ARCore
                       ↘             ↙
                   Native runtimes (Quest, Vision OS, Pico, mobile)
```

For VR (Quest, PCVR, Vision OS) → **XRI 3.x** + **OpenXR** plug-in. For AR (mobile) → **AR Foundation** + ARKit/ARCore providers. Mixed Reality on Quest 3 → AR Foundation features (passthrough, anchors) work on top of OpenXR.

## XRI 3.x — interactors and interactables

```csharp
// On a controller GameObject
NearFarInteractor   — combines direct grab + ray
TeleportInteractor  — for teleport locomotion

// On an interactable object
XRGrabInteractable
XRSocketInteractor (slot)
XRSimpleInteractable (just hover/select)
```

Use the `Interaction Manager` in the scene; both interactors and interactables register with it.

## Locomotion

XRI provides:
- **Continuous Move** + **Continuous Turn** — comfort options (snap turn, vignette).
- **Teleport** — TeleportationProvider + TeleportationArea/Anchor.
- **Climb** — ClimbProvider + ClimbInteractable.

Always offer multiple comfort options (snap turn 30°/45°, smooth turn, vignette intensity slider).

## AR Foundation basics

```csharp
public class PlaneSpawner : MonoBehaviour {
    [SerializeField] private ARRaycastManager raycastManager;
    [SerializeField] private GameObject prefab;
    private static readonly List<ARRaycastHit> Hits = new();

    void Update() {
        if (!Touchscreen.current?.primaryTouch.press.wasPressedThisFrame ?? true) return;
        var pos = Touchscreen.current.primaryTouch.position.ReadValue();
        if (raycastManager.Raycast(pos, Hits, TrackableType.PlaneWithinPolygon)) {
            var hit = Hits[0].pose;
            Instantiate(prefab, hit.position, hit.rotation);
        }
    }
}
```

Add `ARSession`, `ARSessionOrigin` (or `XROrigin` in newer AR Foundation), and the relevant manager components (`ARPlaneManager`, `ARAnchorManager`, `ARFaceManager`, etc.) to the scene.

## Hand tracking

| Platform | API |
|---|---|
| Quest | OpenXR + `OVRSkeleton`/`OVRHand` (Meta SDK) or XR Hands subsystem |
| Vision OS | XR Hands subsystem (OpenXR) |
| Mobile AR (image-based) | AR Foundation `ARHumanBodyManager` (limited) |

Use Unity's **XR Hands** package (`com.unity.xr.hands`) for cross-platform hand poses (joints, gestures).

## Performance for XR

- **Target frame rate**: Quest 2 = 72/90Hz, Quest 3 = 90/120Hz, Vision OS = 90Hz. Missing frame budget causes nausea — non-negotiable.
- **Single-Pass Instanced** stereo rendering (URP): cuts vertex shader work in half.
- **Foveated rendering** on supported platforms (Quest 3 via OpenXR extension).
- **Reproject / spacewarp** as a fallback — but design for native frame rate first.

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Smooth-only locomotion (no comfort options) | Always offer teleport + snap turn |
| Heavy post-processing in VR | Disable bloom/SSAO on Quest; rely on baked lighting |
| World-space UI without curved canvas | Curve UI + raycast from controller for legibility |
| `Camera.main` for head pose | Use `XROrigin.Camera` |
| Ignoring play space recentering | Listen to `OnDeviceRecentered` events |

## Production checklist

- [ ] Frame rate met on minimum-spec headset
- [ ] Comfort options menu (turn type, vignette, height calibration)
- [ ] Hand tracking + controllers both supported (where platform allows)
- [ ] AR session error states handled (camera permission denied, plane lost)
- [ ] Single-pass stereo enabled in URP
- [ ] No motion sickness on a fresh tester
