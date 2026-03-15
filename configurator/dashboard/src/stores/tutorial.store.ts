// SPDX-License-Identifier: MIT

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { TutorialStep } from '@/types/tutorial';

const STORAGE_KEY = 'dev-suite-tutorial-completed';

interface TutorialState {
  isActive: boolean;
  currentStepIndex: number;
  steps: TutorialStep[];
  hasCompleted: boolean;

  startTutorial: (steps: TutorialStep[]) => void;
  endTutorial: (reason: 'completed' | 'skipped') => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
}

const storeCreator: StateCreator<TutorialState, [['zustand/devtools', never]], []> = (set) => ({
  isActive: false,
  currentStepIndex: 0,
  steps: [],
  hasCompleted: localStorage.getItem(STORAGE_KEY) === 'true',

  startTutorial: (steps) =>
    set({ isActive: true, currentStepIndex: 0, steps }, false, 'startTutorial'),

  endTutorial: (reason) => {
    if (reason === 'completed' || reason === 'skipped') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    set({ isActive: false, currentStepIndex: 0, steps: [], hasCompleted: true }, false, 'endTutorial');
  },

  nextStep: () =>
    set(
      (state) => {
        const nextIndex = state.currentStepIndex + 1;
        if (nextIndex >= state.steps.length) {
          return state;
        }
        return { currentStepIndex: nextIndex };
      },
      false,
      'nextStep'
    ),

  prevStep: () =>
    set(
      (state) => ({
        currentStepIndex: Math.max(0, state.currentStepIndex - 1),
      }),
      false,
      'prevStep'
    ),

  goToStep: (index) =>
    set(
      (state) => ({
        currentStepIndex: Math.max(0, Math.min(index, state.steps.length - 1)),
      }),
      false,
      'goToStep'
    ),
});

export const useTutorialStore = create<TutorialState>()(
  devtools(storeCreator, { name: 'TutorialStore' })
);
