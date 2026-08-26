// SPDX-License-Identifier: MIT
import clsx from 'clsx';
import { WIZARD_STEPS } from '@/components/wizard/steps';

export interface WizardStep {
  id: number;
  label: string;
  description?: string;
  status: 'pending' | 'active' | 'completed';
}

export interface SidebarProps {
  mode: 'wizard' | 'menu';
  steps?: WizardStep[];
  currentStep?: number;
  onStepClick?: (step: number) => void;
  canNavigateToStep?: (step: number) => boolean;
}

const defaultSteps: WizardStep[] = WIZARD_STEPS.map((s) => ({ ...s, status: 'pending' as const }));

export function Sidebar({
  mode,
  steps = defaultSteps,
  currentStep = 1,
  onStepClick,
  canNavigateToStep,
}: SidebarProps) {
  if (mode === 'wizard') {
    return (
      <aside className="w-64 border-r border-surface-700 bg-surface-800/50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">
          Setup Steps
        </h2>
        <nav className="space-y-2">
          {steps.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = step.status === 'completed' || step.id < currentStep;
            const canNavigate = canNavigateToStep ? canNavigateToStep(step.id) : isCompleted;

            return (
              <button
                key={step.id}
                onClick={() => canNavigate && onStepClick?.(step.id)}
                disabled={!canNavigate && !isActive}
                className={clsx(
                  'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                  isActive && 'bg-primary-500/10 border border-primary-500/30',
                  !isActive && isCompleted && 'hover:bg-surface-700/50 cursor-pointer',
                  !isActive && !isCompleted && 'opacity-50 cursor-not-allowed'
                )}
              >
                {/* Step Number/Icon */}
                <div
                  className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium',
                    isCompleted && 'bg-green-500 text-white',
                    isActive && !isCompleted && 'bg-primary-500 text-white',
                    !isActive && !isCompleted && 'bg-surface-700 text-surface-400'
                  )}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={clsx(
                      'text-sm font-medium',
                      isActive ? 'text-primary-400' : isCompleted ? 'text-white' : 'text-surface-400'
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-xs text-surface-400 mt-0.5">{step.description}</p>
                  )}
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div
                    className={clsx(
                      'absolute left-[2.125rem] mt-9 w-0.5 h-4',
                      isCompleted ? 'bg-green-500' : 'bg-surface-700'
                    )}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    );
  }

  // Menu mode for other panels
  return (
    <aside className="w-64 border-r border-surface-700 bg-surface-800/50 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">
        Options
      </h2>
      <nav className="space-y-1">
        {/* Placeholder for menu items - will be customized per panel */}
      </nav>
    </aside>
  );
}
