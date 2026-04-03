// SPDX-License-Identifier: MIT
/**
 * Step 0b: Template Configuration
 *
 * Dynamic form for configuring template variables.
 * Handles validation, derived values, and conditional fields.
 */

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import type { TemplateVariable, ScaffoldResult } from '@/types';
import { TEMPLATE_CATEGORY_LABELS, TEMPLATE_CATEGORY_BADGE_CLASSES } from '@/types';
import { useTemplate, useScaffold, useValidateVariables } from '@/hooks';
import { PanelSection } from '../layout';
import { Input, Select, Button, Badge, Spinner } from '../common';

// electronAPI is declared globally in App.tsx

// ============================================
// VARIABLE FIELD COMPONENT
// ============================================

interface VariableFieldProps {
  variable: TemplateVariable;
  value: string;
  error?: string;
  onChange: (name: string, value: string) => void;
  allValues: Record<string, string>;
}

const VariableField = memo(function VariableField({
  variable,
  value,
  error,
  onChange,
  allValues,
}: VariableFieldProps) {
  // All hooks must be called unconditionally before any early returns
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onChange(variable.name, e.target.value);
    },
    [onChange, variable.name]
  );

  const handlePathSelect = useCallback(async () => {
    if (window.electronAPI?.browseFolder) {
      const selected = await window.electronAPI.browseFolder();
      if (selected) {
        // Append project name if available
        const projectName = allValues.projectName;
        if (projectName) {
          const fullPath = `${selected}/${projectName}`;
          onChange(variable.name, fullPath);
        } else {
          onChange(variable.name, selected);
        }
      }
    }
  }, [onChange, variable.name, allValues.projectName]);

  // Handle select change (Select component uses value directly, not event)
  const handleSelectChange = useCallback(
    (newValue: string | string[]) => {
      // Our Select component can return string or string[], but template variables are always single values
      const singleValue = Array.isArray(newValue) ? newValue[0] ?? '' : newValue;
      onChange(variable.name, singleValue);
    },
    [onChange, variable.name]
  );

  // Check conditional visibility
  if (variable.showWhen) {
    const dependentValue = allValues[variable.showWhen.field];
    if (dependentValue !== variable.showWhen.equals) {
      return null;
    }
  }

  // Skip auto-generated and derived fields in the form (they're computed)
  if (variable.autoGenerate) {
    return null;
  }

  // Show derived fields as read-only
  if (variable.derivedFrom) {
    const sourceValue = allValues[variable.derivedFrom] || '';
    const derivedValue = applyTransform(sourceValue, variable.derivedTransform);

    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-300">
          {variable.label}
          {variable.description && (
            <span className="ml-2 text-xs text-gray-500">({variable.description})</span>
          )}
        </label>
        <div className="px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-gray-400">
          {derivedValue || <span className="italic">Will be derived from {variable.derivedFrom}</span>}
        </div>
      </div>
    );
  }

  // Render based on type
  if (variable.type === 'select' && variable.options) {
    const selectOptions = variable.options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    }));

    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-300">
          {variable.label}
          {variable.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {variable.description && (
          <p className="text-xs text-gray-500 mb-1">{variable.description}</p>
        )}
        <Select
          options={selectOptions}
          value={value || variable.default || ''}
          onChange={handleSelectChange}
          error={error}
          fullWidth
          placeholder="Select..."
        />
      </div>
    );
  }

  if (variable.type === 'path') {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-300">
          {variable.label}
          {variable.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {variable.description && (
          <p className="text-xs text-gray-500 mb-1">{variable.description}</p>
        )}
        <div className="flex gap-2">
          <Input
            type="text"
            value={value || ''}
            onChange={handleChange}
            placeholder={variable.placeholder || '/path/to/project'}
            error={error}
            className="flex-1"
          />
          {window.electronAPI?.browseFolder && (
            <Button variant="secondary" onClick={handlePathSelect} type="button">
              Browse...
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Default: text input
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-300">
        {variable.label}
        {variable.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {variable.description && (
        <p className="text-xs text-gray-500 mb-1">{variable.description}</p>
      )}
      <Input
        type="text"
        value={value || variable.default || ''}
        onChange={handleChange}
        placeholder={variable.placeholder}
        error={error}
        fullWidth
      />
    </div>
  );
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function applyTransform(value: string, transform?: string): string {
  if (!transform) return value;

  switch (transform) {
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'kebab-case':
      return value
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
    case 'snake_case':
      return value
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
    case 'camelCase':
      return value
        .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
        .replace(/^./, (c) => c.toLowerCase());
    case 'PascalCase':
      return value
        .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
        .replace(/^./, (c) => c.toUpperCase());
    default:
      return value;
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export interface Step0TemplateConfigProps {
  templateId: string;
  variables: Record<string, string>;
  onVariableChange: (name: string, value: string) => void;
  onScaffoldComplete: (result: ScaffoldResult) => void;
  onBack: () => void;
}

export const Step0TemplateConfig = memo(function Step0TemplateConfig({
  templateId,
  variables,
  onVariableChange,
  onScaffoldComplete,
  onBack,
}: Step0TemplateConfigProps) {
  const { template, loading: templateLoading } = useTemplate(templateId);
  const { validate, loading: validating, result: validationResult } = useValidateVariables();
  const { scaffold, loading: scaffolding, error: scaffoldError, result: scaffoldResult } = useScaffold();

  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update errors when validation result changes
  useEffect(() => {
    if (validationResult) {
      setLocalErrors(validationResult.errors);
    }
  }, [validationResult]);

  // Handle scaffold completion
  useEffect(() => {
    if (scaffoldResult?.success) {
      onScaffoldComplete(scaffoldResult);
    }
  }, [scaffoldResult, onScaffoldComplete]);

  // Client-side validation
  const validateLocally = useCallback((): boolean => {
    if (!template) return false;

    const errors: Record<string, string> = {};

    for (const variable of template.variables) {
      const value = variables[variable.name];

      // Skip hidden fields
      if (variable.showWhen) {
        const dependentValue = variables[variable.showWhen.field];
        if (dependentValue !== variable.showWhen.equals) {
          continue;
        }
      }

      // Skip auto-generated and derived
      if (variable.autoGenerate || variable.derivedFrom) {
        continue;
      }

      // Required check
      if (variable.required && (!value || !value.trim())) {
        errors[variable.name] = `${variable.label} is required`;
        continue;
      }

      if (!value) continue;

      // Min length
      if (variable.minLength && value.length < variable.minLength) {
        errors[variable.name] = `${variable.label} must be at least ${variable.minLength} characters`;
        continue;
      }

      // Max length
      if (variable.maxLength && value.length > variable.maxLength) {
        errors[variable.name] = `${variable.label} must be at most ${variable.maxLength} characters`;
        continue;
      }

      // Pattern
      if (variable.pattern) {
        const regex = new RegExp(variable.pattern);
        if (!regex.test(value)) {
          errors[variable.name] = variable.patternError || `${variable.label} has an invalid format`;
        }
      }
    }

    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }, [template, variables]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!template || isSubmitting) return;

    // Client-side validation first
    if (!validateLocally()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Server-side validation
      const validationRes = await validate(templateId, variables);
      if (!validationRes?.valid) {
        setIsSubmitting(false);
        return;
      }

      // Scaffold the project
      await scaffold({
        templateId,
        projectPath: variables.projectPath ?? '',
        variables,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [template, templateId, variables, validateLocally, validate, scaffold, isSubmitting]);

  // Group variables by category
  const groupedVariables = useMemo(() => {
    if (!template) return { core: [], templateSpecific: [] };

    const coreNames = ['projectName', 'projectPath', 'projectDescription'];
    const core = template.variables.filter((v) => coreNames.includes(v.name));
    const templateSpecific = template.variables.filter((v) => !coreNames.includes(v.name));

    return { core, templateSpecific };
  }, [template]);

  if (templateLoading) {
    return (
      <PanelSection title="Configure Project">
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3 text-gray-400">Loading template details...</span>
        </div>
      </PanelSection>
    );
  }

  if (!template) {
    return (
      <PanelSection title="Configure Project">
        <div className="text-center py-12 text-red-400">
          Template not found
          <button
            type="button"
            onClick={onBack}
            className="block mt-4 mx-auto text-primary-400 hover:text-primary-300"
          >
            Go back to template selection
          </button>
        </div>
      </PanelSection>
    );
  }

  return (
    <PanelSection
      title="Configure Project"
      description={`Configure your new ${template.name} project`}
    >
      {/* Template summary */}
      <div className="mb-6 p-4 bg-surface-800 border border-surface-700 rounded-lg">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-medium text-white">{template.name}</h3>
            <p className="text-sm text-gray-400 mt-1">{template.description}</p>
          </div>
          <Badge
            className={TEMPLATE_CATEGORY_BADGE_CLASSES[template.category]}
          >
            {TEMPLATE_CATEGORY_LABELS[template.category]}
          </Badge>
        </div>
        {template.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {template.technologies.map((tech) => (
              <span
                key={tech}
                className="px-2 py-0.5 text-xs bg-surface-700 text-gray-300 rounded"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-8"
      >
        {/* Core variables */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
            Project Details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groupedVariables.core.map((variable) => (
              <VariableField
                key={variable.name}
                variable={variable}
                value={variables[variable.name] || ''}
                error={localErrors[variable.name]}
                onChange={onVariableChange}
                allValues={variables}
              />
            ))}
          </div>
        </div>

        {/* Template-specific variables */}
        {groupedVariables.templateSpecific.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
              Template Configuration
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupedVariables.templateSpecific.map((variable) => (
                <VariableField
                  key={variable.name}
                  variable={variable}
                  value={variables[variable.name] || ''}
                  error={localErrors[variable.name]}
                  onChange={onVariableChange}
                  allValues={variables}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error message */}
        {scaffoldError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{scaffoldError}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-700">
          <Button type="button" variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || validating || scaffolding}
          >
            {isSubmitting || validating || scaffolding ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {scaffolding ? 'Creating Project...' : 'Validating...'}
              </>
            ) : (
              'Create Project'
            )}
          </Button>
        </div>
      </form>
    </PanelSection>
  );
});
