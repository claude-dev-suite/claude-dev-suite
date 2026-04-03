// SPDX-License-Identifier: MIT

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTutorial } from '@/hooks/useTutorial';
import { useTutorialStore } from '@/stores/tutorial.store';
import type { TutorialStep, TutorialGroup } from '@/types/tutorial';
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialTooltip } from './TutorialTooltip';
import { TutorialWelcome } from './TutorialWelcome';
import { TutorialProgress } from './TutorialProgress';

interface TutorialProviderProps {
  children: ReactNode;
}

/**
 * Find the nearest scrollable ancestor of an element.
 * Walks up the DOM looking for overflow-y: auto|scroll.
 */
function findScrollParent(el: Element): Element | null {
  let current = el.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Check whether an element is visible in the viewport with enough
 * margin for a tooltip. Uses a smaller margin than before so we
 * don't force unnecessary scrolling — the tooltip position system
 * now clamps to viewport bounds as a safety net.
 */
function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const TOP_MARGIN = 80;
  const BOTTOM_MARGIN = 80;
  return (
    rect.top >= TOP_MARGIN &&
    rect.bottom <= window.innerHeight - BOTTOM_MARGIN &&
    rect.left >= 0 &&
    rect.right <= window.innerWidth
  );
}

/**
 * Wait for a scroll to settle by polling element position.
 */
function waitForScrollSettle(el: Element): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    let lastTop = el.getBoundingClientRect().top;
    const poll = setInterval(() => {
      elapsed += 50;
      const currentTop = el.getBoundingClientRect().top;
      const settled = Math.abs(currentTop - lastTop) < 1;
      lastTop = currentTop;

      if ((settled && elapsed > 100) || elapsed >= 800) {
        clearInterval(poll);
        resolve();
      }
    }, 50);
  });
}

/**
 * Scroll the target element into a good viewport position for the
 * tutorial tooltip. Tries centering first; if the container can't
 * scroll far enough, falls back to scrollIntoView('nearest') to
 * at least get the element on-screen.
 */
async function scrollElementToCenter(el: Element): Promise<void> {
  // If already visible with margin, skip scroll
  if (isElementVisible(el)) {
    return;
  }

  const scrollParent = findScrollParent(el);

  if (scrollParent) {
    // Scroll within the overflow container to center the element
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const elCenter = elRect.top + elRect.height / 2;
    const parentCenter = parentRect.top + parentRect.height / 2;
    const scrollDelta = elCenter - parentCenter;

    scrollParent.scrollBy({ top: scrollDelta, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  await waitForScrollSettle(el);

  // After first scroll attempt, check if element is at least on-screen.
  // If not (e.g. element at very bottom of content), try scrollIntoView.
  const rect = el.getBoundingClientRect();
  const onScreen = rect.top >= 0 && rect.bottom <= window.innerHeight;

  if (!onScreen) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await waitForScrollSettle(el);
  }
}

function useSpotlightPosition(target: string | undefined, isActive: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const observerRef = useRef<ResizeObserver>(undefined);
  const scrollingRef = useRef(false);

  const updateRect = useCallback(() => {
    if (!target || !isActive) {
      setRect(null);
      return;
    }

    const el = document.querySelector(`[data-tutorial="${target}"]`);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [target, isActive]);

  // Main effect: when target changes, find element, scroll into view, then track
  useEffect(() => {
    if (!target || !isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      return;
    }

    let cancelled = false;
    // Capture ref value so the cleanup function uses the same timeout id
    const currentRetryRef = retryRef;

    const setup = async () => {
      // Try to find the element (with retries for preAction rendering)
      let el: Element | null = null;
      for (const delay of [0, 150, 400]) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        el = document.querySelector(`[data-tutorial="${target}"]`);
        if (el) break;
      }

      if (!el || cancelled) {
        setRect(null);
        return;
      }

      // Always scroll to center so there's room for the tooltip
      scrollingRef.current = true;
      await scrollElementToCenter(el);
      scrollingRef.current = false;

      if (cancelled) return;

      // Read final position
      setRect(el.getBoundingClientRect());

      // Observe resize on the target element
      observerRef.current?.disconnect();
      observerRef.current = new ResizeObserver(() => {
        if (!scrollingRef.current) updateRect();
      });
      observerRef.current.observe(el);
    };

    void setup();

    // Also track window resize and scroll events for live updates
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      cancelled = true;
      clearTimeout(currentRetryRef.current);
      observerRef.current?.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [target, isActive, updateRect]);

  return rect;
}

// Info-card: centered tooltip without a target
function InfoCardTooltip({
  step,
  onNext,
  onPrev,
  onSkip,
  currentIndex,
  totalSteps,
  allGroups,
}: {
  step: TutorialStep;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  currentIndex: number;
  totalSteps: number;
  allGroups: TutorialGroup[];
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="bg-surface-800 border border-surface-600 rounded-xl shadow-2xl w-[380px] overflow-hidden">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
          <p className="text-xs text-surface-300 leading-relaxed">{step.content}</p>
        </div>
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
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TutorialProvider({ children }: TutorialProviderProps) {
  const tutorial = useTutorial();
  const { isActive, currentStep, currentIndex, totalSteps, next, prev, skip, end } = tutorial;
  const steps = useTutorialStore((s) => s.steps);

  const targetRect = useSpotlightPosition(
    currentStep?.target,
    isActive
  );

  // Keyboard handlers
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          skip();
          break;
        case 'ArrowRight':
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          void next();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          void prev();
          break;
      }
    };

    // Use capture phase so tutorial handles keys before other handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, next, prev, skip]);

  if (!isActive || !currentStep) return <>{children}</>;

  const allGroups = steps.map((s) => s.group);
  const padding = currentStep.spotlightPadding ?? 8;
  const borderRadius = currentStep.spotlightBorderRadius ?? 8;

  return (
    <>
      {children}
      {createPortal(
        <>
          {/* Welcome / Completion cards */}
          {currentStep.type === 'welcome' && (
            <TutorialWelcome
              step={currentStep}
              onStart={() => void next()}
              onSkip={skip}
              onDone={end}
            />
          )}

          {/* Spotlight overlay for spotlight steps */}
          {currentStep.type === 'spotlight' && (
            <TutorialOverlay
              targetRect={targetRect}
              padding={padding}
              borderRadius={borderRadius}
              visible
            />
          )}

          {/* Info-card overlay (dimmed, no cutout) */}
          {currentStep.type === 'info-card' && (
            <TutorialOverlay
              targetRect={null}
              padding={0}
              borderRadius={0}
              visible
            />
          )}

          {/* Tooltip for spotlight steps */}
          {currentStep.type === 'spotlight' && targetRect && (
            <TutorialTooltip
              step={currentStep}
              targetRect={targetRect}
              onNext={() => void next()}
              onPrev={() => void prev()}
              onSkip={skip}
              currentIndex={currentIndex}
              totalSteps={totalSteps}
              allGroups={allGroups}
            />
          )}

          {/* Info-card centered tooltip */}
          {currentStep.type === 'info-card' && (
            <InfoCardTooltip
              step={currentStep}
              onNext={() => void next()}
              onPrev={() => void prev()}
              onSkip={skip}
              currentIndex={currentIndex}
              totalSteps={totalSteps}
              allGroups={allGroups}
            />
          )}
        </>,
        document.body
      )}
    </>
  );
}
