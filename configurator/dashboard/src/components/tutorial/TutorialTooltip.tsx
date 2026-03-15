// SPDX-License-Identifier: MIT

import { useRef, useEffect, useState } from 'react';
import type { TutorialStep, TooltipPosition } from '@/types/tutorial';
import { TutorialProgress } from './TutorialProgress';

interface TutorialTooltipProps {
  step: TutorialStep;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  currentIndex: number;
  totalSteps: number;
  allGroups: TutorialStep['group'][];
}

const TOOLTIP_WIDTH = 340;
const ARROW_SIZE = 8;
const MARGIN = 12;

function computePosition(
  targetRect: DOMRect,
  tooltipHeight: number,
  preferred: TooltipPosition
): { top: number; left: number; position: TooltipPosition } {
  const viewport = { width: window.innerWidth, height: window.innerHeight };

  // Clamp the target rect to viewport bounds for space calculations.
  // The target element may be partially or fully off-screen (e.g. at
  // the very bottom of a scroll container that can't scroll further).
  const clampedTop = Math.max(0, Math.min(targetRect.top, viewport.height));
  const clampedBottom = Math.max(0, Math.min(targetRect.bottom, viewport.height));
  const clampedLeft = Math.max(0, Math.min(targetRect.left, viewport.width));
  const clampedRight = Math.max(0, Math.min(targetRect.right, viewport.width));

  const spaceTop = clampedTop;
  const spaceBottom = viewport.height - clampedBottom;
  const spaceLeft = clampedLeft;
  const spaceRight = viewport.width - clampedRight;

  const needed = tooltipHeight + ARROW_SIZE + MARGIN;

  const centerLeft = Math.max(MARGIN, Math.min(
    targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2,
    viewport.width - TOOLTIP_WIDTH - MARGIN
  ));

  // Try preferred position first, then fallback
  const positions: TooltipPosition[] =
    preferred === 'auto'
      ? ['bottom', 'top', 'right', 'left']
      : [preferred, 'bottom', 'top', 'right', 'left'];

  let top: number;
  let left: number;
  let position: TooltipPosition;
  let found = false;

  for (const pos of positions) {
    if (found) break;
    if (pos === 'bottom' && spaceBottom >= needed) {
      top = clampedBottom + ARROW_SIZE + MARGIN;
      left = centerLeft;
      position = 'bottom';
      found = true;
    } else if (pos === 'top' && spaceTop >= needed) {
      top = clampedTop - tooltipHeight - ARROW_SIZE - MARGIN;
      left = centerLeft;
      position = 'top';
      found = true;
    } else if (pos === 'right' && spaceRight >= TOOLTIP_WIDTH + ARROW_SIZE + MARGIN) {
      top = clampedTop + (clampedBottom - clampedTop) / 2 - tooltipHeight / 2;
      left = clampedRight + ARROW_SIZE + MARGIN;
      position = 'right';
      found = true;
    } else if (pos === 'left' && spaceLeft >= TOOLTIP_WIDTH + ARROW_SIZE + MARGIN) {
      top = clampedTop + (clampedBottom - clampedTop) / 2 - tooltipHeight / 2;
      left = clampedLeft - TOOLTIP_WIDTH - ARROW_SIZE - MARGIN;
      position = 'left';
      found = true;
    }
  }

  if (!found) {
    // Fallback: pick whichever side (top vs bottom) has more space
    position = spaceTop > spaceBottom ? 'top' : 'bottom';
    top = position === 'top'
      ? clampedTop - tooltipHeight - ARROW_SIZE - MARGIN
      : clampedBottom + ARROW_SIZE + MARGIN;
    left = centerLeft;
  }

  // Always clamp final position within viewport bounds
  top = Math.max(MARGIN, Math.min(top!, viewport.height - tooltipHeight - MARGIN));
  left = Math.max(MARGIN, Math.min(left!, viewport.width - TOOLTIP_WIDTH - MARGIN));

  return { top, left, position: position! };
}

function getArrowStyle(position: TooltipPosition, targetRect: DOMRect, tooltipLeft: number) {
  const base = {
    position: 'absolute' as const,
    width: 0,
    height: 0,
  };

  const arrowOffset = Math.max(
    16,
    Math.min(
      targetRect.left + targetRect.width / 2 - tooltipLeft,
      TOOLTIP_WIDTH - 16,
    )
  );

  switch (position) {
    case 'bottom':
      return {
        ...base,
        top: -ARROW_SIZE,
        left: arrowOffset,
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid #2d3748`,
      };
    case 'top':
      return {
        ...base,
        bottom: -ARROW_SIZE,
        left: arrowOffset,
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderTop: `${ARROW_SIZE}px solid #2d3748`,
      };
    case 'left':
      return {
        ...base,
        top: '50%',
        right: -ARROW_SIZE,
        transform: 'translateY(-50%)',
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderLeft: `${ARROW_SIZE}px solid #2d3748`,
      };
    case 'right':
      return {
        ...base,
        top: '50%',
        left: -ARROW_SIZE,
        transform: 'translateY(-50%)',
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid #2d3748`,
      };
    default:
      return base;
  }
}

export function TutorialTooltip({
  step,
  targetRect,
  onNext,
  onPrev,
  onSkip,
  currentIndex,
  totalSteps,
  allGroups,
}: TutorialTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(200);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight);
      setPlaced(true);
    }
  }, [step.id, targetRect]);

  if (!targetRect) return null;

  const preferred = step.tooltipPosition ?? 'auto';
  const { top, left, position } = computePosition(targetRect, tooltipHeight, preferred);
  const arrowStyle = getArrowStyle(position, targetRect, left);

  const isLast = currentIndex >= totalSteps - 1;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[10000] transition-all duration-300"
      style={{
        top,
        left,
        width: TOOLTIP_WIDTH,
        opacity: placed ? 1 : 0,
      }}
    >
      {/* Arrow */}
      <div style={arrowStyle} />

      {/* Card */}
      <div className="bg-surface-800 border border-surface-600 rounded-xl shadow-2xl overflow-hidden">
        {/* Content */}
        <div className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
          <p className="text-xs text-surface-300 leading-relaxed">{step.content}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-700 bg-surface-800/50">
          <TutorialProgress
            current={currentIndex}
            total={totalSteps}
            groups={allGroups}
            currentGroup={step.group}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="text-xs text-surface-400 hover:text-surface-200 transition-colors px-2 py-1"
            >
              Skip
            </button>
            {currentIndex > 0 && (
              <button
                onClick={onPrev}
                className="text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="text-xs bg-primary-500 hover:bg-primary-400 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
