// SPDX-License-Identifier: MIT

import { useCallback } from 'react';
import { useTutorialStore } from '@/stores/tutorial.store';
import { useUIStore } from '@/stores/ui.store';
import { createTutorialSteps } from '@/components/tutorial/tutorial-steps';

export interface UseTutorialResult {
  start: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  skip: () => void;
  end: () => void;
  isActive: boolean;
  currentStep: ReturnType<typeof useTutorialStore.getState>['steps'][number] | undefined;
  currentIndex: number;
  totalSteps: number;
  hasCompleted: boolean;
}

export function useTutorial(): UseTutorialResult {
  const isActive = useTutorialStore((s) => s.isActive);
  const currentIndex = useTutorialStore((s) => s.currentStepIndex);
  const steps = useTutorialStore((s) => s.steps);
  const hasCompleted = useTutorialStore((s) => s.hasCompleted);

  const currentStep = steps[currentIndex];

  const cleanup = useCallback(() => {
    const ui = useUIStore.getState();
    ui.closeAllModals();
    ui.closeAllToolWindows();
  }, []);

  const start = useCallback(() => {
    const ui = useUIStore.getState();
    const tutorialSteps = createTutorialSteps({
      setPanel: ui.setPanel as (panel: 'orchestrator' | 'code-review') => void,
      openModal: ui.openModal,
      closeModal: ui.closeModal,
      openToolWindow: ui.openToolWindow,
      closeToolWindow: ui.closeToolWindow as (id: 'git' | 'manage' | 'analytics') => void,
      closeAllToolWindows: ui.closeAllToolWindows,
    });
    useTutorialStore.getState().startTutorial(tutorialSteps);
  }, []);

  const next = useCallback(async () => {
    const store = useTutorialStore.getState();
    const { currentStepIndex, steps: currentSteps } = store;

    if (currentStepIndex >= currentSteps.length - 1) {
      store.endTutorial('completed');
      cleanup();
      return;
    }

    // Execute postAction of current step
    const current = currentSteps[currentStepIndex];
    if (current?.postAction) {
      await current.postAction();
    }

    // Advance
    store.nextStep();

    // Execute preAction of next step
    const nextStep = currentSteps[currentStepIndex + 1];
    if (nextStep?.preAction) {
      await nextStep.preAction();
    }

    // Wait for DOM to update after preAction
    await new Promise((r) => requestAnimationFrame(r));
  }, [cleanup]);

  const prev = useCallback(async () => {
    const store = useTutorialStore.getState();
    const { currentStepIndex, steps: currentSteps } = store;

    if (currentStepIndex <= 0) return;

    store.prevStep();

    // Execute preAction of previous step to restore UI state
    const prevStep = currentSteps[currentStepIndex - 1];
    if (prevStep?.preAction) {
      await prevStep.preAction();
    }

    await new Promise((r) => requestAnimationFrame(r));
  }, []);

  const skip = useCallback(() => {
    useTutorialStore.getState().endTutorial('skipped');
    cleanup();
  }, [cleanup]);

  const end = useCallback(() => {
    useTutorialStore.getState().endTutorial('completed');
    cleanup();
  }, [cleanup]);

  return {
    start,
    next,
    prev,
    skip,
    end,
    isActive,
    currentStep,
    currentIndex,
    totalSteps: steps.length,
    hasCompleted,
  };
}
