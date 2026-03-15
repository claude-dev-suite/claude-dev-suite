// SPDX-License-Identifier: MIT
/**
 * Custom hooks for template operations
 *
 * Provides hooks for listing templates, getting template details,
 * validating variables, and scaffolding projects.
 *
 * @example
 * ```tsx
 * // List all templates
 * const { templates, loading, error } = useTemplates();
 *
 * // Get template details
 * const { template, loading } = useTemplate('springboot-api');
 *
 * // Scaffold a new project
 * const { scaffold, loading, error } = useScaffold();
 * await scaffold({ templateId: 'react', projectPath: '/path', variables: {} });
 * ```
 */

import { useState, useCallback } from 'react';
import { useApi, invalidateCache } from './useApi';
import { useMutation } from './useMutation';
import type {
  TemplatesListResponse,
  TemplateDetailResponse,
  TemplateListItem,
  TemplateInfo,
  TemplateCategory,
  ScaffoldRequest,
  ScaffoldResponse,
  ValidateVariablesRequest,
  ValidateVariablesResponse,
} from '@/types';

// ============================================
// USE TEMPLATES HOOK
// ============================================

export interface UseTemplatesOptions {
  /** Filter by category */
  category?: TemplateCategory;
  /** Skip initial fetch */
  skip?: boolean;
}

export interface UseTemplatesResult {
  /** List of available templates */
  templates: TemplateListItem[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch templates */
  refetch: () => void;
  /** Filter templates by category */
  filterByCategory: (category: TemplateCategory | 'all') => TemplateListItem[];
  /** Search templates by name or description */
  search: (query: string) => TemplateListItem[];
}

/**
 * Hook to list all available templates
 */
export function useTemplates(options: UseTemplatesOptions = {}): UseTemplatesResult {
  const { skip = false } = options;

  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<TemplatesListResponse>('/api/templates', { skip });

  const templates = data?.templates || [];

  const filterByCategory = useCallback(
    (category: TemplateCategory | 'all'): TemplateListItem[] => {
      if (category === 'all') return templates;
      return templates.filter((t) => t.category === category);
    },
    [templates]
  );

  const search = useCallback(
    (query: string): TemplateListItem[] => {
      if (!query.trim()) return templates;
      const lowerQuery = query.toLowerCase();
      return templates.filter(
        (t) =>
          t.name.toLowerCase().includes(lowerQuery) ||
          t.description.toLowerCase().includes(lowerQuery) ||
          t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
          t.technologies.some((tech) => tech.toLowerCase().includes(lowerQuery))
      );
    },
    [templates]
  );

  return {
    templates,
    loading,
    error,
    refetch,
    filterByCategory,
    search,
  };
}

// ============================================
// USE TEMPLATE HOOK
// ============================================

export interface UseTemplateOptions {
  /** Skip initial fetch */
  skip?: boolean;
}

export interface UseTemplateResult {
  /** Template details */
  template: TemplateInfo | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch template */
  refetch: () => void;
}

/**
 * Hook to get detailed information about a specific template
 */
export function useTemplate(templateId: string | null, options: UseTemplateOptions = {}): UseTemplateResult {
  const { skip = false } = options;

  const shouldSkip = skip || !templateId;

  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<TemplateDetailResponse>(
    templateId ? `/api/templates/${templateId}` : '/api/templates/null',
    { skip: shouldSkip }
  );

  return {
    template: data?.template || null,
    loading: shouldSkip ? false : loading,
    error: shouldSkip ? null : error,
    refetch,
  };
}

// ============================================
// USE VALIDATE VARIABLES HOOK
// ============================================

export interface UseValidateVariablesResult {
  /** Validate variables for a template */
  validate: (templateId: string, variables: Record<string, string>) => Promise<ValidateVariablesResponse | null>;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Last validation result */
  result: ValidateVariablesResponse | null;
  /** Reset error state */
  reset: () => void;
}

/**
 * Hook to validate template variables
 */
export function useValidateVariables(): UseValidateVariablesResult {
  const [result, setResult] = useState<ValidateVariablesResponse | null>(null);

  const {
    mutate,
    loading,
    error,
    reset: resetMutation,
  } = useMutation<ValidateVariablesResponse, ValidateVariablesRequest>('/api/templates/validate', 'POST');

  const validate = useCallback(
    async (templateId: string, variables: Record<string, string>): Promise<ValidateVariablesResponse | null> => {
      const response = await mutate({ templateId, variables });
      if (response) {
        setResult(response);
      }
      return response;
    },
    [mutate]
  );

  const reset = useCallback(() => {
    setResult(null);
    resetMutation();
  }, [resetMutation]);

  return {
    validate,
    loading,
    error,
    result,
    reset,
  };
}

// ============================================
// USE SCAFFOLD HOOK
// ============================================

export interface UseScaffoldResult {
  /** Scaffold a new project */
  scaffold: (config: ScaffoldRequest) => Promise<ScaffoldResponse | null>;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Last scaffold result */
  result: ScaffoldResponse | null;
  /** Reset error state */
  reset: () => void;
}

/**
 * Hook to scaffold a new project from a template
 */
export function useScaffold(): UseScaffoldResult {
  const [result, setResult] = useState<ScaffoldResponse | null>(null);

  const {
    mutate,
    loading,
    error,
    reset: resetMutation,
  } = useMutation<ScaffoldResponse, ScaffoldRequest>('/api/templates/scaffold', 'POST', {
    onSuccess: () => {
      // Invalidate any cached data that might be affected
      invalidateCache('/api/detect');
    },
  });

  const scaffold = useCallback(
    async (config: ScaffoldRequest): Promise<ScaffoldResponse | null> => {
      const response = await mutate(config);
      if (response) {
        setResult(response);
      }
      return response;
    },
    [mutate]
  );

  const reset = useCallback(() => {
    setResult(null);
    resetMutation();
  }, [resetMutation]);

  return {
    scaffold,
    loading,
    error,
    result,
    reset,
  };
}

// ============================================
// COMBINED HOOK FOR TEMPLATE CONFIGURATION
// ============================================

export interface UseTemplateConfigState {
  /** Currently selected template ID */
  selectedTemplateId: string | null;
  /** Current variable values */
  variables: Record<string, string>;
  /** Validation errors */
  validationErrors: Record<string, string>;
  /** Computed/derived values */
  computedValues: Record<string, string>;
}

export interface UseTemplateConfigResult {
  /** Current state */
  state: UseTemplateConfigState;
  /** Select a template */
  selectTemplate: (templateId: string) => void;
  /** Update a variable value */
  setVariable: (name: string, value: string) => void;
  /** Set all variables at once */
  setVariables: (variables: Record<string, string>) => void;
  /** Validate current variables */
  validate: () => Promise<boolean>;
  /** Scaffold the project with current config */
  scaffold: () => Promise<ScaffoldResponse | null>;
  /** Reset to initial state */
  reset: () => void;
  /** Template details for selected template */
  template: TemplateInfo | null;
  /** Whether template is loading */
  templateLoading: boolean;
  /** Whether validation is in progress */
  validating: boolean;
  /** Whether scaffolding is in progress */
  scaffolding: boolean;
  /** General error message */
  error: string | null;
}

/**
 * Combined hook for managing template configuration workflow
 */
export function useTemplateConfig(): UseTemplateConfigResult {
  const [state, setState] = useState<UseTemplateConfigState>({
    selectedTemplateId: null,
    variables: {},
    validationErrors: {},
    computedValues: {},
  });

  const { template, loading: templateLoading } = useTemplate(state.selectedTemplateId);
  const { validate: validateVars, loading: validating } = useValidateVariables();
  const { scaffold: scaffoldProject, loading: scaffolding, error } = useScaffold();

  const selectTemplate = useCallback((templateId: string) => {
    setState((prev) => ({
      ...prev,
      selectedTemplateId: templateId,
      variables: {},
      validationErrors: {},
      computedValues: {},
    }));
  }, []);

  const setVariable = useCallback((name: string, value: string) => {
    setState((prev) => ({
      ...prev,
      variables: { ...prev.variables, [name]: value },
      // Clear error for this field when it's modified
      validationErrors: { ...prev.validationErrors, [name]: '' },
    }));
  }, []);

  const setVariables = useCallback((variables: Record<string, string>) => {
    setState((prev) => ({
      ...prev,
      variables,
      validationErrors: {},
    }));
  }, []);

  const validate = useCallback(async (): Promise<boolean> => {
    if (!state.selectedTemplateId) return false;

    const result = await validateVars(state.selectedTemplateId, state.variables);
    if (result) {
      setState((prev) => ({
        ...prev,
        validationErrors: result.errors,
        computedValues: result.computedValues,
      }));
      return result.valid;
    }
    return false;
  }, [state.selectedTemplateId, state.variables, validateVars]);

  const scaffold = useCallback(async (): Promise<ScaffoldResponse | null> => {
    if (!state.selectedTemplateId || !state.variables.projectPath) {
      return null;
    }

    // Validate first
    const isValid = await validate();
    if (!isValid) return null;

    return scaffoldProject({
      templateId: state.selectedTemplateId,
      projectPath: state.variables.projectPath,
      variables: state.variables,
    });
  }, [state.selectedTemplateId, state.variables, validate, scaffoldProject]);

  const reset = useCallback(() => {
    setState({
      selectedTemplateId: null,
      variables: {},
      validationErrors: {},
      computedValues: {},
    });
  }, []);

  return {
    state,
    selectTemplate,
    setVariable,
    setVariables,
    validate,
    scaffold,
    reset,
    template,
    templateLoading,
    validating,
    scaffolding,
    error,
  };
}
