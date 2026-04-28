---
name: unity-2d-gameplay
description: |
  Unity 2D gameplay patterns — character controllers (kinematic vs dynamic),
  coyote time, jump buffer, variable jump height, ledge grab, dash, wall slide,
  hitstop, juice patterns, top-down 8-way movement.

  USE WHEN: implementing platformer / metroidvania / top-down character
  controllers, "feel" tuning, ability layers (dash/double jump/wall slide).

  DO NOT USE FOR: 2D physics fundamentals (use `unity-2d-physics`); animations
  (use `unity-2d-animation`); cameras (use `unity-2d-cameras`).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Unity 2D Gameplay (platformer feel)

## Kinematic vs Dynamic for player

**Recommended: Kinematic Rigidbody2D** for tight platformer feel — you control all motion, no surprise forces, but you still get collision via `Rigidbody2D.Cast` / `MovePosition`. Dynamic is fine for physics-driven games (Angry Birds-style).

## Platformer character controller — minimum viable

```csharp
[RequireComponent(typeof(Rigidbody2D))]
public class PlatformerController : MonoBehaviour {
    [Header("Move")]
    [SerializeField] private float moveSpeed = 8f;
    [SerializeField] private float accelGrounded = 80f;
    [SerializeField] private float accelAir = 30f;

    [Header("Jump")]
    [SerializeField] private float jumpVelocity = 14f;
    [SerializeField] private float coyoteTime = 0.1f;
    [SerializeField] private float jumpBuffer = 0.1f;
    [SerializeField] private float lowJumpGravityMul = 2.5f;
    [SerializeField] private float fallGravityMul = 2f;

    [Header("Ground check")]
    [SerializeField] private Transform groundCheck;
    [SerializeField] private Vector2 groundCheckSize = new(0.6f, 0.1f);
    [SerializeField] private LayerMask groundMask;

    private Rigidbody2D _rb;
    private float _inputX;
    private float _coyoteCounter;
    private float _jumpBufferCounter;
    private bool _grounded;
    private float _baseGravity;

    void Awake() {
        _rb = GetComponent<Rigidbody2D>();
        _baseGravity = _rb.gravityScale;
    }

    public void SetInput(float x)  => _inputX = x;
    public void RequestJump()      => _jumpBufferCounter = jumpBuffer;
    public void ReleaseJump()      => _earlyRelease = true;

    private bool _earlyRelease;

    void Update() {
        // ground probe
        _grounded = Physics2D.OverlapBox(groundCheck.position, groundCheckSize, 0f, groundMask);

        // coyote time — leave the ledge but still allowed to jump
        if (_grounded) _coyoteCounter = coyoteTime;
        else           _coyoteCounter -= Time.deltaTime;

        // jump buffer — pressed jump just before landing
        if (_jumpBufferCounter > 0f) _jumpBufferCounter -= Time.deltaTime;

        // execute jump
        if (_jumpBufferCounter > 0f && _coyoteCounter > 0f) {
            var v = _rb.linearVelocity;
            v.y = jumpVelocity;
            _rb.linearVelocity = v;
            _jumpBufferCounter = 0f;
            _coyoteCounter = 0f;
        }

        // variable jump height — release Jump early to cut height
        if (_earlyRelease && _rb.linearVelocity.y > 0f) {
            _rb.gravityScale = _baseGravity * lowJumpGravityMul;
        }
        else if (_rb.linearVelocity.y < 0f) {
            _rb.gravityScale = _baseGravity * fallGravityMul;     // snappier fall
        }
        else {
            _rb.gravityScale = _baseGravity;
        }
        _earlyRelease = false;
    }

    void FixedUpdate() {
        // smooth horizontal — accel toward target
        var v = _rb.linearVelocity;
        float targetX = _inputX * moveSpeed;
        float accel = _grounded ? accelGrounded : accelAir;
        v.x = Mathf.MoveTowards(v.x, targetX, accel * Time.fixedDeltaTime);
        _rb.linearVelocity = v;
    }
}
```

Tune the four values — `coyoteTime`, `jumpBuffer`, `lowJumpGravityMul`, `fallGravityMul` — to taste. They're the difference between a frustrating jump and a delicious one.

## Coyote time + jump buffer (in plain words)

- **Coyote time** — the small grace window after you walk off a ledge during which the game still treats you as grounded for jump purposes. Compensates for human reaction time. Typical: 80–120 ms.
- **Jump buffer** — pressing jump shortly before landing still triggers a jump on touchdown. Typical: 80–150 ms.

Both are "feel" features players notice subconsciously by their absence.

## Wall slide + wall jump (additions)

```csharp
bool wallContact = Physics2D.OverlapBox(wallCheck.position, wallCheckSize, 0f, wallMask);
if (wallContact && !_grounded && _rb.linearVelocity.y < 0f) {
    var v = _rb.linearVelocity;
    v.y = Mathf.Max(v.y, -wallSlideSpeed);  // capped fall
    _rb.linearVelocity = v;
}

// wall jump on input + wall contact
if (jumpPressed && wallContact && !_grounded) {
    _rb.linearVelocity = new Vector2(-Mathf.Sign(_inputX) * wallJumpX, wallJumpY);
}
```

## Dash

```csharp
IEnumerator Dash(Vector2 dir) {
    _isDashing = true;
    _rb.gravityScale = 0f;
    _rb.linearVelocity = dir.normalized * dashSpeed;
    yield return new WaitForSeconds(dashDuration);
    _rb.gravityScale = _baseGravity;
    _isDashing = false;
}
```

Disable input/jump during dash; restore previous gravity after.

## Hitstop / juice

On hit:
- Freeze time briefly (`Time.timeScale = 0` for 50–80 ms, restore).
- Camera shake via Cinemachine Impulse.
- Sprite flash white via material property block.
- Particle pop + SFX with random pitch.

These small frills carry most of the felt impact in 2D combat.

## Top-down 8-way movement

Same idea, no jump:

```csharp
void FixedUpdate() {
    Vector2 target = new Vector2(_inputX, _inputY).normalized * moveSpeed;
    var v = _rb.linearVelocity;
    v = Vector2.MoveTowards(v, target, accel * Time.fixedDeltaTime);
    _rb.linearVelocity = v;
}
```

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| `transform.Translate` for player | Kinematic Rigidbody2D + `linearVelocity` |
| Jump only when `_grounded == true` | Add coyote + buffer; check counters |
| Same gravity on rise and fall | Multiply gravity on fall for snappier descent |
| One-shot dash with no cooldown / iframes | Add cooldown timer + invulnerability flag during dash |
| Hard freeze without restoring | Use coroutine that always restores `Time.timeScale` |

## Production checklist

- [ ] Coyote time + jump buffer tuned
- [ ] Variable jump height
- [ ] Different gravity for rise vs fall
- [ ] Wall slide / wall jump (if applicable)
- [ ] Dash with i-frames + cooldown
- [ ] Hitstop on impactful events
- [ ] Camera follow uses Cinemachine Position Composer
- [ ] Pixel Perfect Camera if pixel art
