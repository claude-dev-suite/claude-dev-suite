// SPDX-License-Identifier: MIT
/**
 * Recipe Editor Modal
 *
 * Modal for customizing recipe options with user-friendly controls.
 */

import { useState, useEffect } from 'react';
import { Button, Modal, ModalFooter, Input, Checkbox, Select } from '../common';
import type { AutomationRecipe, RecipeOption, RecipeTestResult } from '@/types';
import { RECIPE_ICONS, CATEGORY_LABELS } from '@/types';
import clsx from 'clsx';

export interface RecipeEditorModalProps {
  isOpen: boolean;
  recipe: AutomationRecipe;
  currentOptions?: Record<string, unknown>;
  onClose: () => void;
  onSave: (options: Record<string, unknown>) => void;
  onTest?: (options: Record<string, unknown>) => Promise<RecipeTestResult | null>;
  isSaving?: boolean;
  isTesting?: boolean;
  testResult?: RecipeTestResult | null;
}

export function RecipeEditorModal({
  isOpen,
  recipe,
  currentOptions,
  onClose,
  onSave,
  onTest,
  isSaving = false,
  isTesting = false,
  testResult,
}: RecipeEditorModalProps) {
  // Initialize options from current or defaults
  const [options, setOptions] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const opt of recipe.options) {
      initial[opt.id] = currentOptions?.[opt.id] ?? opt.defaultValue;
    }
    return initial;
  });

  // Reset options when modal opens or recipe changes
  useEffect(() => {
    const initial: Record<string, unknown> = {};
    for (const opt of recipe.options) {
      initial[opt.id] = currentOptions?.[opt.id] ?? opt.defaultValue;
    }
    setOptions(initial);
  }, [recipe, currentOptions, isOpen]);

  const handleOptionChange = (optionId: string, value: unknown) => {
    setOptions(prev => ({
      ...prev,
      [optionId]: value,
    }));
  };

  const handleSave = () => {
    onSave(options);
  };

  const handleTest = async () => {
    if (onTest) {
      await onTest(options);
    }
  };

  const iconPath = RECIPE_ICONS[recipe.icon] || RECIPE_ICONS.code;
  const categoryLabel = CATEGORY_LABELS[recipe.category];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Customize: ${recipe.name}`}
      size="md"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmText="Save"
          loading={isSaving}
        />
      }
    >
      <div className="space-y-6">
        {/* Recipe info */}
        <div className="flex items-start gap-3 p-4 bg-surface-800 rounded-lg">
          <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-primary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
            </svg>
          </div>
          <div>
            <p className="text-sm text-surface-400">{recipe.description}</p>
            <p className="text-xs text-surface-500 mt-1">{categoryLabel}</p>
          </div>
        </div>

        {/* Options */}
        {recipe.options.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-white">Options</h3>
            {recipe.options.map(opt => (
              <OptionField
                key={opt.id}
                option={opt}
                value={options[opt.id]}
                onChange={(value) => handleOptionChange(opt.id, value)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-surface-400">
            <p>This automation has no configurable options.</p>
          </div>
        )}

        {/* Test button */}
        {onTest && (
          <div className="pt-4 border-t border-surface-700">
            <Button
              variant="secondary"
              onClick={handleTest}
              loading={isTesting}
              fullWidth
            >
              Test Configuration
            </Button>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className={clsx(
            'p-4 rounded-lg border',
            testResult.success
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className={clsx('w-5 h-5', testResult.success ? 'text-green-400' : 'text-red-400')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {testResult.success ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                )}
              </svg>
              <span className={clsx('font-medium', testResult.success ? 'text-green-400' : 'text-red-400')}>
                {testResult.success ? 'Test Passed' : 'Test Failed'}
              </span>
              {testResult.duration !== undefined && (
                <span className="text-xs text-surface-400">
                  ({testResult.duration}ms)
                </span>
              )}
            </div>
            {testResult.output && (
              <p className="text-sm text-surface-300">{testResult.output}</p>
            )}
            {testResult.error && (
              <p className="text-sm text-red-300">{testResult.error}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface OptionFieldProps {
  option: RecipeOption;
  value: unknown;
  onChange: (value: unknown) => void;
}

function OptionField({ option, value, onChange }: OptionFieldProps) {
  switch (option.type) {
    case 'checkbox':
      return (
        <Checkbox
          label={option.label}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );

    case 'select':
      return (
        <Select
          label={option.label}
          value={String(value ?? '')}
          onChange={(val) => onChange(val)}
          options={option.choices?.map(c => ({
            value: c.value,
            label: c.label,
          })) ?? []}
          fullWidth
        />
      );

    case 'multiselect':
      return (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-surface-300">
            {option.label}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {option.choices?.map(choice => {
              const values = Array.isArray(value) ? value : [];
              const isChecked = values.includes(choice.value);

              return (
                <label
                  key={choice.value}
                  className={clsx(
                    'flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                    isChecked
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-surface-600 hover:border-surface-500'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const newValues = e.target.checked
                        ? [...values, choice.value]
                        : values.filter((v: unknown) => v !== choice.value);
                      onChange(newValues);
                    }}
                    className="rounded border-surface-600 bg-surface-700 text-primary-500"
                  />
                  <span className="text-sm text-surface-300">{choice.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );

    case 'text':
      return (
        <Input
          label={option.label}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          fullWidth
        />
      );

    default:
      return null;
  }
}
