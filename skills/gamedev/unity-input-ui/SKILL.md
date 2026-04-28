---
name: unity-input-ui
description: |
  Unity new Input System and UI — InputAction, InputActionAsset, PlayerInput,
  rebinding, multi-device, plus UI Toolkit (UXML/USS, runtime + editor) and
  uGUI Canvas optimization.

  USE WHEN: wiring input bindings, supporting gamepads/keyboard/touch, building
  menus/HUD with UI Toolkit or uGUI, optimizing Canvas batches, runtime
  rebinding, on-screen control overlays.

  DO NOT USE FOR: legacy `Input.GetKey` API (deprecated — migrate to new Input
  System); 3D world-space UI specifics (use `unity-rendering`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Input System & UI

## New Input System — basics

```csharp
public class PlayerInput : MonoBehaviour {
    [SerializeField] private InputActionAsset inputActions;
    private InputAction _move, _jump, _attack;

    private void OnEnable() {
        var gameplay = inputActions.FindActionMap("Gameplay", true);
        gameplay.Enable();
        _move   = gameplay.FindAction("Move", true);
        _jump   = gameplay.FindAction("Jump", true);
        _attack = gameplay.FindAction("Attack", true);

        _jump.performed   += OnJump;
        _attack.performed += OnAttack;
    }

    private void OnDisable() {
        _jump.performed   -= OnJump;
        _attack.performed -= OnAttack;
    }

    private void Update() {
        Vector2 dir = _move.ReadValue<Vector2>();
        // movement using dir
    }

    private void OnJump(InputAction.CallbackContext ctx)   => /* jump */;
    private void OnAttack(InputAction.CallbackContext ctx) => /* attack */;
}
```

`PlayerInput` component variant: use when designer wants a UI to wire callbacks; manual binding (above) is better for systems code.

## Action types

- **Button** — pressed/released; works for any binding kind.
- **Value** — continuous (e.g. stick).
- **PassThrough** — unfiltered, for raw streams (gestures).

## Composite bindings (WASD + arrows + stick)

In InputActionAsset: action `Move` (Value/Vector2), 2D Vector composite with W/A/S/D + arrows; second binding from `<Gamepad>/leftStick`.

## Runtime rebinding

```csharp
var rebind = action.PerformInteractiveRebindingOperation()
    .WithControlsExcluding("<Mouse>/position")
    .WithCancelingThrough("<Keyboard>/escape")
    .OnComplete(op => {
        op.Dispose();
        SaveBindings(inputActions);
    })
    .Start();
```

Save with `inputActions.SaveBindingOverridesAsJson()` → PlayerPrefs/file. Load on startup with `LoadBindingOverridesFromJson(json)`.

## On-screen controls

Use the Input System's `On-Screen Button`/`On-Screen Stick` components on UI elements; they emit input through the same action — no separate touch path.

## UI Toolkit (UXML/USS)

```xml
<!-- HUD.uxml -->
<ui:UXML xmlns:ui="UnityEngine.UIElements">
  <ui:VisualElement class="hud-root">
    <ui:Label name="health" class="hud-label" text="HP: 100" />
    <ui:ProgressBar name="hpBar" low-value="0" high-value="100" value="100" />
  </ui:VisualElement>
</ui:UXML>
```

```css
/* HUD.uss */
.hud-root { position: absolute; top: 16px; left: 16px; }
.hud-label { color: white; font-size: 18px; -unity-font-style: bold; }
```

```csharp
public class HUD : MonoBehaviour {
    [SerializeField] private UIDocument doc;
    private Label _health;
    private ProgressBar _hpBar;

    private void OnEnable() {
        var root = doc.rootVisualElement;
        _health = root.Q<Label>("health");
        _hpBar  = root.Q<ProgressBar>("hpBar");
    }

    public void SetHealth(int hp) {
        _health.text  = $"HP: {hp}";
        _hpBar.value  = hp;
    }
}
```

UI Toolkit is the default for new in-game UI in Unity 6 — better batching, retained-mode tree, USS hot reload.

## uGUI optimization (when you must use uGUI)

| Issue | Fix |
|---|---|
| Whole canvas redraws on any change | Split canvas: static elements on one, dynamic on another |
| Many `Image` with different sprites | Sprite Atlas v2 → identical material → batched |
| Per-frame `text.text = …` | Only assign when value actually changes |
| `LayoutGroup` rebuilds | Cache results; prefer fixed sizes when possible |

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `Input.GetKey` legacy API | Use new Input System actions |
| Polling `_jump.WasPressedThisFrame()` everywhere | Subscribe to `.performed` events once |
| One huge canvas with HUD + menus | Multiple canvases; only the one being interacted redraws |
| `GameObject.Find("HpBar")` | `[SerializeField]` reference or `UIDocument.rootVisualElement.Q` |

## Production checklist

- [ ] InputActionAsset committed; bindings cover keyboard + gamepad + touch
- [ ] Rebinding UI persists overrides
- [ ] UI Toolkit used for new UI; uGUI only for legacy reasons
- [ ] All sprites in Sprite Atlases
- [ ] Canvas split static vs dynamic
- [ ] EventSystem present and configured for chosen UI module
