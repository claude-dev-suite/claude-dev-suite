using UnityEngine;
using UnityEngine.InputSystem;

namespace Game.Player {
    /// <summary>
    /// Minimum-viable 2D platformer character controller with coyote time,
    /// jump buffer and variable jump height. Pair with a Rigidbody2D set to
    /// Body Type = Dynamic (or Kinematic if you prefer manual physics).
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public class PlayerController2D : MonoBehaviour {
        [Header("Movement")]
        [SerializeField] private float moveSpeed = 8f;
        [SerializeField] private float accelGrounded = 80f;
        [SerializeField] private float accelAir = 30f;

        [Header("Jump")]
        [SerializeField] private float jumpVelocity = 14f;
        [SerializeField, Range(0f, 0.3f)] private float coyoteTime = 0.1f;
        [SerializeField, Range(0f, 0.3f)] private float jumpBuffer = 0.1f;
        [SerializeField, Min(1f)] private float lowJumpGravityMul = 2.5f;
        [SerializeField, Min(1f)] private float fallGravityMul = 2f;

        [Header("Ground check")]
        [SerializeField] private Transform groundCheck;
        [SerializeField] private Vector2 groundCheckSize = new(0.6f, 0.1f);
        [SerializeField] private LayerMask groundMask;

        [Header("Input")]
        [SerializeField] private InputActionAsset inputActions;
        [SerializeField] private string actionMap = "Gameplay";
        [SerializeField] private string moveAction = "Move";
        [SerializeField] private string jumpAction = "Jump";

        private Rigidbody2D _rb;
        private InputAction _move;
        private InputAction _jump;

        private float _inputX;
        private bool _grounded;
        private float _coyoteCounter;
        private float _jumpBufferCounter;
        private bool _earlyRelease;
        private float _baseGravity;

        private void Awake() {
            _rb = GetComponent<Rigidbody2D>();
            _baseGravity = _rb.gravityScale;
        }

        private void OnEnable() {
            var map = inputActions.FindActionMap(actionMap, true);
            map.Enable();
            _move = map.FindAction(moveAction, true);
            _jump = map.FindAction(jumpAction, true);
            _jump.performed += OnJumpPerformed;
            _jump.canceled  += OnJumpCanceled;
        }

        private void OnDisable() {
            if (_jump == null) return;
            _jump.performed -= OnJumpPerformed;
            _jump.canceled  -= OnJumpCanceled;
        }

        private void OnJumpPerformed(InputAction.CallbackContext _) => _jumpBufferCounter = jumpBuffer;
        private void OnJumpCanceled(InputAction.CallbackContext _)  => _earlyRelease = true;

        private void Update() {
            _inputX = _move?.ReadValue<Vector2>().x ?? 0f;

            _grounded = Physics2D.OverlapBox(groundCheck.position, groundCheckSize, 0f, groundMask);
            _coyoteCounter = _grounded ? coyoteTime : _coyoteCounter - Time.deltaTime;
            if (_jumpBufferCounter > 0f) _jumpBufferCounter -= Time.deltaTime;

            if (_jumpBufferCounter > 0f && _coyoteCounter > 0f) {
                var v = _rb.linearVelocity;
                v.y = jumpVelocity;
                _rb.linearVelocity = v;
                _jumpBufferCounter = 0f;
                _coyoteCounter = 0f;
            }

            if (_earlyRelease && _rb.linearVelocity.y > 0f) {
                _rb.gravityScale = _baseGravity * lowJumpGravityMul;
            } else if (_rb.linearVelocity.y < 0f) {
                _rb.gravityScale = _baseGravity * fallGravityMul;
            } else {
                _rb.gravityScale = _baseGravity;
            }
            _earlyRelease = false;
        }

        private void FixedUpdate() {
            var v = _rb.linearVelocity;
            float targetX = _inputX * moveSpeed;
            float accel = _grounded ? accelGrounded : accelAir;
            v.x = Mathf.MoveTowards(v.x, targetX, accel * Time.fixedDeltaTime);
            _rb.linearVelocity = v;
        }

        private void OnDrawGizmosSelected() {
            if (groundCheck == null) return;
            Gizmos.color = _grounded ? Color.green : Color.red;
            Gizmos.DrawWireCube(groundCheck.position, groundCheckSize);
        }
    }
}
