// SPDX-License-Identifier: MIT

import type { TutorialStep } from '@/types/tutorial';

interface TutorialWelcomeProps {
  step: TutorialStep;
  onStart?: () => void;
  onSkip?: () => void;
  onDone?: () => void;
}

export function TutorialWelcome({ step, onStart, onSkip, onDone }: TutorialWelcomeProps) {
  const isCompletion = step.id === 'completion';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70">
      <div className="bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Icon */}
        <div className="flex justify-center pt-8 pb-4">
          {isCompletion ? (
            <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary-500/20 border-2 border-primary-500/40 flex items-center justify-center">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-sm">DS</span>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-8 pb-4 text-center">
          <h2 className="text-xl font-semibold text-white mb-3">{step.title}</h2>
          <p className="text-sm text-surface-300 leading-relaxed">{step.content}</p>
          {!isCompletion && (
            <p className="text-xs text-surface-500 mt-3">~2 min tour</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-8 pb-8 pt-2">
          {isCompletion ? (
            <button
              onClick={onDone}
              className="flex-1 bg-primary-500 hover:bg-primary-400 text-white py-3 px-4 rounded-xl text-sm font-medium transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onSkip}
                className="flex-1 bg-surface-700 hover:bg-surface-600 text-surface-200 py-3 px-4 rounded-xl text-sm font-medium transition-colors"
              >
                Skip
              </button>
              <button
                onClick={onStart}
                className="flex-1 bg-primary-500 hover:bg-primary-400 text-white py-3 px-4 rounded-xl text-sm font-medium transition-colors"
              >
                Start Tour
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
