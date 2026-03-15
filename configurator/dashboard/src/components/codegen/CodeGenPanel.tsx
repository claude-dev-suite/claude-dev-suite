// SPDX-License-Identifier: MIT
import { useCallback } from 'react';
import clsx from 'clsx';
import { useCodeGenStore } from '../../stores/codegen.store';
import type { CodeGenStep } from '../../stores/codegen.store';
import { TechSelector } from './TechSelector';
import { FileUploader } from './FileUploader';
import { OutputConfig } from './OutputConfig';
import { GenerationPreview } from './GenerationPreview';
import { GenerationConsole } from './GenerationConsole';

const STEPS: Array<{ number: CodeGenStep; label: string }> = [
  { number: 1, label: 'Technology' },
  { number: 2, label: 'Upload Spec' },
  { number: 3, label: 'Configure' },
  { number: 4, label: 'Preview' },
  { number: 5, label: 'Generate' },
];

export interface CodeGenPanelProps {
  projectPath: string;
  onStartRefinement?: (job: unknown) => void;
}

export function CodeGenPanel({ projectPath, onStartRefinement }: CodeGenPanelProps) {
  const currentStep = useCodeGenStore((s) => s.currentStep);
  const setStep = useCodeGenStore((s) => s.setStep);
  const technology = useCodeGenStore((s) => s.technology);
  const validation = useCodeGenStore((s) => s.validation);
  const targetLanguage = useCodeGenStore((s) => s.targetLanguage);
  const generatedFiles = useCodeGenStore((s) => s.generatedFiles);
  const reset = useCodeGenStore((s) => s.reset);

  const canGoToStep = useCallback(
    (step: CodeGenStep): boolean => {
      switch (step) {
        case 1:
          return true;
        case 2:
          return technology !== null;
        case 3:
          return validation !== null && validation.valid;
        case 4:
          return targetLanguage !== null;
        case 5:
          return generatedFiles.length > 0 || (targetLanguage !== null && validation?.valid === true);
        default:
          return false;
      }
    },
    [technology, validation, targetLanguage, generatedFiles]
  );

  const handleStepClick = useCallback(
    (step: CodeGenStep) => {
      if (canGoToStep(step)) {
        setStep(step);
      }
    },
    [canGoToStep, setStep]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Code Generator</h2>
          <p className="text-sm text-surface-400">
            Generate code from API specifications with AI-powered refinement
          </p>
        </div>
        <button
          onClick={reset}
          className="px-3 py-1.5 text-sm text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-surface-700/50 bg-surface-800/50">
        {STEPS.map((step, idx) => (
          <div key={step.number} className="flex items-center">
            {idx > 0 && (
              <div
                className={clsx(
                  'w-8 h-px mx-2',
                  currentStep > step.number - 1 ? 'bg-primary-500' : 'bg-surface-600'
                )}
              />
            )}
            <button
              onClick={() => handleStepClick(step.number)}
              disabled={!canGoToStep(step.number)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                currentStep === step.number
                  ? 'bg-primary-500/20 text-primary-400'
                  : canGoToStep(step.number)
                  ? 'text-surface-300 hover:bg-surface-700 cursor-pointer'
                  : 'text-surface-500 cursor-not-allowed'
              )}
            >
              <span
                className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  currentStep === step.number
                    ? 'bg-primary-500 text-white'
                    : currentStep > step.number
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-surface-600 text-surface-400'
                )}
              >
                {currentStep > step.number ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </span>
              {step.label}
            </button>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {currentStep === 1 && <TechSelector />}
        {currentStep === 2 && <FileUploader />}
        {currentStep === 3 && <OutputConfig projectPath={projectPath} />}
        {currentStep === 4 && <GenerationPreview projectPath={projectPath} />}
        {currentStep === 5 && (
          <GenerationConsole projectPath={projectPath} onStartRefinement={onStartRefinement} />
        )}
      </div>
    </div>
  );
}
