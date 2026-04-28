using UnityEngine;

namespace Game.CameraSystem {
    /// <summary>
    /// Lightweight 2D camera follow as a starter — for production switch to
    /// Cinemachine: a CinemachineCamera with Position Composer body and a
    /// CinemachineConfiner2D extension bound to a PolygonCollider2D level
    /// boundary. Add CinemachinePixelPerfect on the brain if shipping pixel art.
    /// </summary>
    public class CameraFollow2D : MonoBehaviour {
        [SerializeField] private Transform target;
        [SerializeField] private Vector2 offset = new(0f, 1f);
        [SerializeField, Range(0f, 1f)] private float smoothTime = 0.15f;
        [SerializeField] private bool clampToBounds;
        [SerializeField] private Vector2 minBounds;
        [SerializeField] private Vector2 maxBounds;

        private Vector3 _velocity;

        private void LateUpdate() {
            if (target == null) return;
            Vector3 desired = new(target.position.x + offset.x, target.position.y + offset.y, transform.position.z);
            if (clampToBounds) {
                desired.x = Mathf.Clamp(desired.x, minBounds.x, maxBounds.x);
                desired.y = Mathf.Clamp(desired.y, minBounds.y, maxBounds.y);
            }
            transform.position = Vector3.SmoothDamp(transform.position, desired, ref _velocity, smoothTime);
        }
    }
}
