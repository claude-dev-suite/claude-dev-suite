// SPDX-License-Identifier: MIT
/**
 * Automations Panel Component
 *
 * User-friendly interface for managing automation recipes.
 * Replaces the technical HooksConfig with a recipe-based approach.
 */

import { useState, useEffect, useRef } from 'react';
import { useRecipes } from '@/hooks';
import { Button, Badge } from '../common';
import { RecipeCard, CompactRecipeCard } from './RecipeCard';
import { RecipeEditorModal } from './RecipeEditorModal';
import type { AutomationRecipe, RecipeCardInfo, RecipeCategory } from '@/types';
import { CATEGORY_DESCRIPTIONS } from '@/types';
import clsx from 'clsx';

export interface AutomationsPanelProps {
  projectPath: string;
}

type ViewMode = 'recommended' | 'all' | 'active';

export function AutomationsPanel({ projectPath }: AutomationsPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('recommended');
  const [expandedCategory, setExpandedCategory] = useState<RecipeCategory | null>(null);
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    recipe: AutomationRecipe | null;
    currentOptions?: Record<string, unknown>;
  }>({
    isOpen: false,
    recipe: null,
  });

  const {
    recipes,
    categories,
    // recommendations and enabled are used via recipeCards
    detectedTools,
    isLoading,
    isEnabling,
    isDisabling,
    isTesting,
    isCustomizing,
    error,
    refresh,
    enableRecipe,
    disableRecipe,
    customizeRecipe,
    testRecipe,
    enabledCount,
    recommendedCount,
    recipeCards,
    lastTestResult,
    clearTestResult,
  } = useRecipes({ projectPath });

  // Track if initial fetch has been done
  const initialFetchDone = useRef(false);

  // Force fetch on first mount if data is not available
  useEffect(() => {
    if (!initialFetchDone.current && recipes.length === 0 && !isLoading && projectPath) {
      initialFetchDone.current = true;
      refresh();
    }
  }, [recipes.length, isLoading, projectPath, refresh]);

  const handleEnable = async (recipeId: string) => {
    await enableRecipe(recipeId);
  };

  const handleDisable = async (recipeId: string) => {
    await disableRecipe(recipeId);
  };

  const handleCustomize = (recipe: AutomationRecipe, currentOptions?: Record<string, unknown>) => {
    setEditorState({
      isOpen: true,
      recipe,
      currentOptions,
    });
  };

  const handleSaveCustomization = async (options: Record<string, unknown>) => {
    if (!editorState.recipe) return;
    await customizeRecipe(editorState.recipe.id, options);
    setEditorState({ isOpen: false, recipe: null });
  };

  const handleTest = async (options: Record<string, unknown>) => {
    if (!editorState.recipe) return null;
    return await testRecipe(editorState.recipe.id, options);
  };

  const handleCloseEditor = () => {
    setEditorState({ isOpen: false, recipe: null });
    clearTestResult();
  };

  // Get active recipes
  const activeRecipes = recipeCards.filter(c => c.isEnabled);

  // Get recommended recipes (not yet enabled)
  const recommendedRecipes = recipeCards.filter(c => c.isRecommended && !c.isEnabled);

  // Loading state
  if (isLoading && recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mb-4" />
        <p className="text-surface-400">Loading automations...</p>
      </div>
    );
  }

  // Error state
  if (error && recipes.length === 0) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <h3 className="text-red-400 font-medium mb-2">Error loading automations</h3>
          <p className="text-red-400/80 text-sm">{error}</p>
          <Button variant="ghost" onClick={refresh} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">Automations</h3>
          <p className="text-sm text-surface-400 mt-0.5">
            Configure automatic actions for Claude and Git
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <Badge variant="success">{enabledCount} active</Badge>
            {recommendedCount > 0 && (
              <Badge variant="info">{recommendedCount} recommended</Badge>
            )}
          </div>

          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Detected tools info */}
      {detectedTools && (
        <div className="p-3 bg-surface-800/50 rounded-lg border border-surface-700">
          <p className="text-xs text-surface-400">
            <span className="text-surface-300">Detected tools:</span>
            {' '}
            {[
              ...detectedTools.formatters,
              ...detectedTools.linters,
              ...detectedTools.testRunners,
            ].join(', ') || 'None'}
            {detectedTools.hasTypeScript && ', TypeScript'}
            {detectedTools.hasGit && ', Git'}
          </p>
        </div>
      )}

      {/* View mode tabs */}
      <div className="flex gap-1 border-b border-surface-700">
        <button
          onClick={() => setViewMode('recommended')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'recommended'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-surface-400 hover:text-white'
          )}
        >
          Recommended
          {recommendedCount > 0 && (
            <Badge variant="default" className="ml-2">{recommendedCount}</Badge>
          )}
        </button>
        <button
          onClick={() => setViewMode('active')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'active'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-surface-400 hover:text-white'
          )}
        >
          Active
          {enabledCount > 0 && (
            <Badge variant="success" className="ml-2">{enabledCount}</Badge>
          )}
        </button>
        <button
          onClick={() => setViewMode('all')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'all'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-surface-400 hover:text-white'
          )}
        >
          All Automations
          <Badge variant="default" className="ml-2">{recipes.length}</Badge>
        </button>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'recommended' && (
        <RecommendedView
          recipes={recommendedRecipes}
          onEnable={handleEnable}
          onCustomize={handleCustomize}
          isEnabling={isEnabling}
        />
      )}

      {viewMode === 'active' && (
        <ActiveView
          recipes={activeRecipes}
          onDisable={handleDisable}
          onCustomize={handleCustomize}
          isDisabling={isDisabling}
        />
      )}

      {viewMode === 'all' && (
        <AllView
          categories={categories}
          recipeCards={recipeCards}
          expandedCategory={expandedCategory}
          onToggleCategory={(cat) => setExpandedCategory(prev => prev === cat ? null : cat)}
          onEnable={handleEnable}
          onDisable={handleDisable}
          onCustomize={handleCustomize}
          isEnabling={isEnabling}
          isDisabling={isDisabling}
        />
      )}

      {/* Recipe editor modal */}
      {editorState.isOpen && editorState.recipe && (
        <RecipeEditorModal
          isOpen={editorState.isOpen}
          recipe={editorState.recipe}
          currentOptions={editorState.currentOptions}
          onClose={handleCloseEditor}
          onSave={handleSaveCustomization}
          onTest={handleTest}
          isSaving={isCustomizing}
          isTesting={isTesting}
          testResult={lastTestResult}
        />
      )}
    </div>
  );
}

// ============================================
// VIEW COMPONENTS
// ============================================

interface RecommendedViewProps {
  recipes: RecipeCardInfo[];
  onEnable: (id: string) => void;
  onCustomize: (recipe: AutomationRecipe, options?: Record<string, unknown>) => void;
  isEnabling: boolean;
}

function RecommendedView({ recipes, onEnable, onCustomize, isEnabling }: RecommendedViewProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto text-green-500 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-lg font-medium text-surface-300 mb-2">
          All Recommendations Applied
        </h3>
        <p className="text-sm text-surface-400">
          You've enabled all recommended automations for your project.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-400">
        These automations are recommended based on your project's detected tools and frameworks.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {recipes.map(card => (
          <RecipeCard
            key={card.recipe.id}
            card={card}
            onEnable={() => onEnable(card.recipe.id)}
            onDisable={() => {}}
            onCustomize={() => onCustomize(card.recipe, card.customOptions)}
            isEnabling={isEnabling}
          />
        ))}
      </div>
    </div>
  );
}

interface ActiveViewProps {
  recipes: RecipeCardInfo[];
  onDisable: (id: string) => void;
  onCustomize: (recipe: AutomationRecipe, options?: Record<string, unknown>) => void;
  isDisabling: boolean;
}

function ActiveView({ recipes, onDisable, onCustomize, isDisabling }: ActiveViewProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto text-surface-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <h3 className="text-lg font-medium text-surface-300 mb-2">
          No Active Automations
        </h3>
        <p className="text-sm text-surface-400">
          Enable automations from the "Recommended" or "All" tabs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recipes.map(card => (
        <CompactRecipeCard
          key={card.recipe.id}
          card={card}
          onDisable={() => onDisable(card.recipe.id)}
          onCustomize={() => onCustomize(card.recipe, card.customOptions)}
          isDisabling={isDisabling}
        />
      ))}
    </div>
  );
}

interface AllViewProps {
  categories: Array<{ category: RecipeCategory; label: string; recipes: AutomationRecipe[] }>;
  recipeCards: RecipeCardInfo[];
  expandedCategory: RecipeCategory | null;
  onToggleCategory: (category: RecipeCategory) => void;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onCustomize: (recipe: AutomationRecipe, options?: Record<string, unknown>) => void;
  isEnabling: boolean;
  isDisabling: boolean;
}

function AllView({
  categories,
  recipeCards,
  expandedCategory,
  onToggleCategory,
  onEnable,
  onDisable,
  onCustomize,
  isEnabling,
  isDisabling,
}: AllViewProps) {
  const cardMap = new Map(recipeCards.map(c => [c.recipe.id, c]));

  return (
    <div className="space-y-4">
      {categories.map(({ category, label, recipes }) => {
        const isExpanded = expandedCategory === category;
        const enabledInCategory = recipes.filter(r => cardMap.get(r.id)?.isEnabled).length;

        return (
          <div key={category} className="border border-surface-700 rounded-lg overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => onToggleCategory(category)}
              className="w-full flex items-center justify-between p-4 bg-surface-800 hover:bg-surface-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <h4 className="font-medium text-white">{label}</h4>
                <Badge variant="default">{recipes.length}</Badge>
                {enabledInCategory > 0 && (
                  <Badge variant="success">{enabledInCategory} active</Badge>
                )}
              </div>
              <svg
                className={clsx(
                  'w-5 h-5 text-surface-400 transition-transform',
                  isExpanded && 'rotate-180'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Category content */}
            {isExpanded && (
              <div className="p-4 space-y-4 bg-surface-800/30">
                <p className="text-sm text-surface-400">
                  {CATEGORY_DESCRIPTIONS[category]}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {recipes.map(recipe => {
                    const card = cardMap.get(recipe.id);
                    if (!card) return null;

                    return (
                      <RecipeCard
                        key={recipe.id}
                        card={card}
                        onEnable={() => onEnable(recipe.id)}
                        onDisable={() => onDisable(recipe.id)}
                        onCustomize={() => onCustomize(recipe, card.customOptions)}
                        isEnabling={isEnabling}
                        isDisabling={isDisabling}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
