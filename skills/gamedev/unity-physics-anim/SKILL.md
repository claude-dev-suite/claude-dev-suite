---
name: unity-physics-anim
description: |
  Unity 3D physics (Rigidbody, Collider, Joints) and animation (Animator state
  machines, parameters, layers, Animation Rigging, Humanoid retargeting,
  blend trees).

  USE WHEN: tuning rigidbody movement, designing Animator state machines,
  blending animations, layer collision matrix, joints/constraints, motion
  warping, IK setups.

  DO NOT USE FOR: 2D physics or 2D animation (use `unity-2d-physics` /
  `unity-2d-animation`); ECS physics (use `unity-dots`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity Physics & Animation (3D)

## Rigidbody fundamentals

```csharp
[RequireComponent(typeof(Rigidbody))]
public class CharacterMover : MonoBehaviour {
    [SerializeField] private float moveSpeed = 6f;
    [SerializeField] private float jumpVelocity = 8f;
    private Rigidbody _rb;
    private Vector2 _input;
    private bool _jumpQueued;

    private void Awake() {
        _rb = GetComponent<Rigidbody>();
        _rb.interpolation = RigidbodyInterpolation.Interpolate;     // smooth visual
        _rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
    }

    public void SetInput(Vector2 i)   => _input = i;
    public void Jump()                => _jumpQueued = true;

    private void FixedUpdate() {
        Vector3 vel = _rb.linearVelocity;
        Vector3 target = new Vector3(_input.x, 0, _input.y) * moveSpeed;
        vel.x = target.x; vel.z = target.z;
        if (_jumpQueued) { vel.y = jumpVelocity; _jumpQueued = false; }
        _rb.linearVelocity = vel;
    }
}
```

Note: in Unity 6 it's `linearVelocity` (not `velocity`).

## Layer collision matrix

Edit > Project Settings > Physics > Layer Collision Matrix. Default — too permissive. Cull pairs you don't need (Player/PlayerProjectile, Enemy/EnemyProjectile) for both correctness and perf.

## Joints

| Joint | Use |
|---|---|
| Hinge | Doors, swinging objects |
| Configurable | Custom freedom — vehicles, ragdolls |
| Spring | Soft-body-like bouncy connections |
| Fixed | Two rigidbodies behaving as one (breakable) |

## Animator state machine

```
[Idle] --(Speed > 0.1)--> [Run]
[Run]  --(Speed < 0.1)--> [Idle]
[Run]  --(Jump trigger)-> [Jump] --(Grounded && Vel<0)--> [Land] --> [Idle]
```

Parameters: `float Speed`, `bool Grounded`, `trigger Jump`. **Cache hashes**:

```csharp
private static readonly int SpeedHash    = Animator.StringToHash("Speed");
private static readonly int JumpHash     = Animator.StringToHash("Jump");

void Update() => _animator.SetFloat(SpeedHash, _input.magnitude);
void OnJump() => _animator.SetTrigger(JumpHash);
```

## Animator layers + masks

Upper-body shooting layer over base locomotion: layer with weight 1, Avatar Mask covering only spine/arms, Override blending mode.

## Animation Rigging

Use for procedural pose adjustments without breaking animation: Two-Bone IK (hand to weapon), Multi-Aim Constraint (head looks at target), Damped Transform (cloth-like trailing).

Rig builds at runtime via `RigBuilder` — animations evaluate first, then rig constraints adjust.

## Humanoid retargeting

Map any FBX with similar skeleton to Mecanim Humanoid → animations swap across characters automatically. Generic rig only when humanoid mapping doesn't fit (quadrupeds, robots).

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `transform.position` writes for Rigidbody object | `rb.MovePosition` / set linearVelocity in FixedUpdate |
| `Update` for physics input | FixedUpdate for physics writes; Update for input sampling + jump-queue flags |
| String parameter names every frame | Cache `Animator.StringToHash` ints |
| Many Animator transitions w/ no exit time | Set `Has Exit Time = false` + Transition Duration = 0 for snappy combat |
| Heavy IK on every character every frame | Disable RigBuilder when off-screen / culled |

## Production checklist

- [ ] Layer collision matrix culled
- [ ] Rigidbody interpolation set on player + camera-tracked objects
- [ ] Continuous collision on fast-moving bodies
- [ ] Animator parameters use cached hashes
- [ ] Humanoid avatars share animations across characters
- [ ] Rig constraints disabled when not visible
