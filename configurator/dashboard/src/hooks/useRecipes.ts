// SPDX-License-Identifier: MIT
/**
 * Recipes Hook
 *
 * Custom hook for managing automation recipes in dev-suite projects.
 * Handles fetching recipes, enabling/disabling, customizing, and testing.
 */

import { useState, useCallback, useMemo } from 'react';
import { useApi, invalidateCache } from './useApi';
import { useMutation } from './useMutation';
import type {
  AutomationRecipe,
  RecipeCategoryGroup,
  EnabledAutomation,
  RecipeRecommendation,
  DetectedTools,
  RecipeOperationResult,
  RecipeTestResult,
  RecipeCardInfo,
  EnableRecipeRequest,
  DisableRecipeRequest,
  CustomizeRecipeRequest,
  TestRecipeRequest,
} from '@/types';
import { getLogger } from '@/utils/logger';

const logger = getLogger('useRecipes');

export interface UseRecipesOptions {
  /** Project path */
  projectPath: string;
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
}

export interface UseRecipesResult {
  // Recipe data
  recipes: AutomationRecipe[];
  categories: RecipeCategoryGroup[];
  recommendations: RecipeRecommendation[];
  enabled: EnabledAutomation[];
  detectedTools: DetectedTools | null;

  // Loading states
  isLoading: boolean;
  isEnabling: boolean;
  isDisabling: boolean;
  isTesting: boolean;
  isCustomizing: boolean;

  // Error state
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  enableRecipe: (recipeId: string, customOptions?: Record<string, unknown>) => Promise<RecipeOperationResult | null>;
  disableRecipe: (recipeId: string) => Promise<RecipeOperationResult | null>;
  customizeRecipe: (recipeId: string, options: Record<string, unknown>) => Promise<RecipeOperationResult | null>;
  testRecipe: (recipeId: string, customOptions?: Record<string, unknown>) => Promise<RecipeTestResult | null>;

  // Computed values
  enabledCount: number;
  recommendedCount: number;
  recipeCards: RecipeCardInfo[];

  // Test result state
  lastTestResult: RecipeTestResult | null;
  clearTestResult: () => void;
}

/**
 * Hook for managing automation recipes
 */
export function useRecipes(options: UseRecipesOptions): UseRecipesResult {
  const { projectPath, autoFetch = true } = options;

  // Test result state
  const [lastTestResult, setLastTestResult] = useState<RecipeTestResult | null>(null);

  // Fetch all recipes
  const {
    data: recipesData,
    loading: isLoadingRecipes,
    error: recipesError,
    refetch: refetchRecipes,
  } = useApi<{ recipes: AutomationRecipe[]; categories: RecipeCategoryGroup[] }>(
    '/api/automation-recipes',
    { skip: !autoFetch }
  );

  // Fetch recommendations
  const {
    data: recommendationsData,
    loading: isLoadingRecommendations,
    error: recommendationsError,
    refetch: refetchRecommendations,
  } = useApi<{ recommendations: RecipeRecommendation[]; enabled: EnabledAutomation[] }>(
    `/api/automation-recipes/recommended?path=${encodeURIComponent(projectPath)}`,
    { skip: !autoFetch || !projectPath }
  );

  // Fetch detected tools
  const {
    data: detectedTools,
    loading: isLoadingTools,
    refetch: refetchTools,
  } = useApi<DetectedTools>(
    `/api/detected-tools?path=${encodeURIComponent(projectPath)}`,
    { skip: !autoFetch || !projectPath }
  );

  // Enable mutation
  const {
    loading: isEnabling,
    error: enableError,
    mutate: enableMutate,
    reset: resetEnable,
  } = useMutation<RecipeOperationResult, EnableRecipeRequest>('/api/automation/enable');

  // Disable mutation
  const {
    loading: isDisabling,
    error: disableError,
    mutate: disableMutate,
    reset: resetDisable,
  } = useMutation<RecipeOperationResult, DisableRecipeRequest>('/api/automation/disable');

  // Customize mutation
  const {
    loading: isCustomizing,
    error: customizeError,
    mutate: customizeMutate,
    reset: resetCustomize,
  } = useMutation<RecipeOperationResult, CustomizeRecipeRequest>('/api/automation/customize');

  // Test mutation
  const {
    loading: isTesting,
    error: testError,
    mutate: testMutate,
    reset: resetTest,
  } = useMutation<RecipeTestResult, TestRecipeRequest>('/api/automation/test');

  // Refresh all data
  const refresh = useCallback(async () => {
    logger.info('Refreshing recipes data', { projectPath });
    invalidateCache('/api/automation-recipes');
    invalidateCache(`/api/automation-recipes/recommended?path=${encodeURIComponent(projectPath)}`);
    invalidateCache(`/api/detected-tools?path=${encodeURIComponent(projectPath)}`);
    await Promise.all([
      refetchRecipes(),
      refetchRecommendations(),
      refetchTools(),
    ]);
  }, [projectPath, refetchRecipes, refetchRecommendations, refetchTools]);

  // Enable a recipe
  const enableRecipe = useCallback(async (
    recipeId: string,
    customOptions?: Record<string, unknown>
  ): Promise<RecipeOperationResult | null> => {
    logger.info('Enabling recipe', { recipeId, projectPath });
    resetEnable();

    const result = await enableMutate({
      projectPath,
      recipeId,
      customOptions,
    });

    if (result?.success) {
      // Refresh data after enabling
      await refresh();
    }

    return result;
  }, [projectPath, enableMutate, resetEnable, refresh]);

  // Disable a recipe
  const disableRecipe = useCallback(async (recipeId: string): Promise<RecipeOperationResult | null> => {
    logger.info('Disabling recipe', { recipeId, projectPath });
    resetDisable();

    const result = await disableMutate({
      projectPath,
      recipeId,
    });

    if (result?.success) {
      // Refresh data after disabling
      await refresh();
    }

    return result;
  }, [projectPath, disableMutate, resetDisable, refresh]);

  // Customize a recipe
  const customizeRecipe = useCallback(async (
    recipeId: string,
    options: Record<string, unknown>
  ): Promise<RecipeOperationResult | null> => {
    logger.info('Customizing recipe', { recipeId, projectPath });
    resetCustomize();

    const result = await customizeMutate({
      projectPath,
      recipeId,
      options,
    });

    if (result?.success) {
      // Refresh data after customizing
      await refresh();
    }

    return result;
  }, [projectPath, customizeMutate, resetCustomize, refresh]);

  // Test a recipe
  const testRecipe = useCallback(async (
    recipeId: string,
    customOptions?: Record<string, unknown>
  ): Promise<RecipeTestResult | null> => {
    logger.info('Testing recipe', { recipeId, projectPath });
    resetTest();
    setLastTestResult(null);

    const result = await testMutate({
      projectPath,
      recipeId,
      customOptions,
    });

    if (result) {
      setLastTestResult(result);
    }

    return result;
  }, [projectPath, testMutate, resetTest]);

  // Clear test result
  const clearTestResult = useCallback(() => {
    setLastTestResult(null);
  }, []);

  // Computed: recipe cards for UI
  const recipeCards = useMemo((): RecipeCardInfo[] => {
    const recipes = recipesData?.recipes ?? [];
    const enabled = recommendationsData?.enabled ?? [];
    const recommendations = recommendationsData?.recommendations ?? [];

    const enabledMap = new Map(enabled.map(e => [e.recipeId, e]));
    const recommendationMap = new Map(recommendations.map(r => [r.recipe.id, r]));

    return recipes.map(recipe => {
      const enabledInfo = enabledMap.get(recipe.id);
      const recommendationInfo = recommendationMap.get(recipe.id);

      return {
        recipe,
        isEnabled: enabledInfo?.enabled ?? false,
        isRecommended: !!recommendationInfo,
        recommendationReason: recommendationInfo?.reason,
        customOptions: enabledInfo?.customOptions,
      };
    });
  }, [recipesData, recommendationsData]);

  // Computed values
  const enabledCount = useMemo(() => {
    return recommendationsData?.enabled.filter(e => e.enabled).length ?? 0;
  }, [recommendationsData]);

  const recommendedCount = useMemo(() => {
    return recommendationsData?.recommendations.length ?? 0;
  }, [recommendationsData]);

  // Combine errors
  const error = recipesError || recommendationsError || enableError || disableError || customizeError || testError;

  return {
    // Recipe data
    recipes: recipesData?.recipes ?? [],
    categories: recipesData?.categories ?? [],
    recommendations: recommendationsData?.recommendations ?? [],
    enabled: recommendationsData?.enabled ?? [],
    detectedTools: detectedTools ?? null,

    // Loading states
    isLoading: isLoadingRecipes || isLoadingRecommendations || isLoadingTools,
    isEnabling,
    isDisabling,
    isTesting,
    isCustomizing,

    // Error state
    error,

    // Actions
    refresh,
    enableRecipe,
    disableRecipe,
    customizeRecipe,
    testRecipe,

    // Computed values
    enabledCount,
    recommendedCount,
    recipeCards,

    // Test result state
    lastTestResult,
    clearTestResult,
  };
}
