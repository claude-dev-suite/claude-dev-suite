// SPDX-License-Identifier: MIT
/**
 * Custom Hooks - Barrel Export
 *
 * This file exports all custom hooks for convenient imports.
 *
 * @example
 * ```tsx
 * import { useApi, useMutation, useWebSocket, useToast } from '@/hooks';
 * ```
 */

export { useApi, invalidateCache } from './useApi';
export { useMutation } from './useMutation';
export { useWebSocket } from './useWebSocket';
export { useToast } from './useToast';
export { useComponentLogger, useComponentLoggerQuiet } from './useComponentLogger';
export { useFocusTrap } from './useFocusTrap';
export { useUpgrade } from './useUpgrade';
export { useRecipes } from './useRecipes';
export { useAutoUpdater } from './useAutoUpdater';
export { useTemplates, useTemplate, useValidateVariables, useScaffold, useTemplateConfig } from './useTemplates';
export { useCustomAgents } from './useCustomAgents';
export { useTutorial } from './useTutorial';

// Re-export types
export type {
  UseApiOptions,
  UseApiResult,
} from './useApi';

export type {
  UseMutationOptions,
  UseMutationResult,
} from './useMutation';

export type {
  UseWebSocketOptions,
  UseWebSocketResult,
} from './useWebSocket';

export type {
  ToastOptions,
  UseToastResult,
} from './useToast';

export type {
  UseUpgradeOptions,
  UseUpgradeResult,
} from './useUpgrade';

export type {
  UseRecipesOptions,
  UseRecipesResult,
} from './useRecipes';

export type {
  UseAutoUpdaterOptions,
  UseAutoUpdaterResult,
} from './useAutoUpdater';

export type {
  UseTemplatesOptions,
  UseTemplatesResult,
  UseTemplateOptions,
  UseTemplateResult,
  UseValidateVariablesResult,
  UseScaffoldResult,
  UseTemplateConfigState,
  UseTemplateConfigResult,
} from './useTemplates';

export type {
  UseCustomAgentsResult,
} from './useCustomAgents';

export type {
  UseTutorialResult,
} from './useTutorial';
