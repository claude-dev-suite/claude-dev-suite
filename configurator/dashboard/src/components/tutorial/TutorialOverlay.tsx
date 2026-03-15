// SPDX-License-Identifier: MIT

interface TutorialOverlayProps {
  targetRect: DOMRect | null;
  padding: number;
  borderRadius: number;
  visible: boolean;
}

export function TutorialOverlay({ targetRect, padding, borderRadius, visible }: TutorialOverlayProps) {
  if (!visible) return null;

  // When no target, render a full overlay (for welcome/info-card steps)
  const hasTarget = targetRect !== null;

  const cutX = hasTarget ? targetRect.left - padding : 0;
  const cutY = hasTarget ? targetRect.top - padding : 0;
  const cutW = hasTarget ? targetRect.width + padding * 2 : 0;
  const cutH = hasTarget ? targetRect.height + padding * 2 : 0;

  return (
    <svg
      className="fixed inset-0 z-[9999]"
      style={{ width: '100vw', height: '100vh', pointerEvents: 'none' }}
    >
      <defs>
        <mask id="tutorial-spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          {hasTarget && (
            <rect
              x={cutX}
              y={cutY}
              width={cutW}
              height={cutH}
              rx={borderRadius}
              ry={borderRadius}
              fill="black"
              style={{ transition: 'all 300ms ease-in-out' }}
            />
          )}
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.7)"
        mask="url(#tutorial-spotlight-mask)"
        style={{ pointerEvents: 'all' }}
      />
    </svg>
  );
}
