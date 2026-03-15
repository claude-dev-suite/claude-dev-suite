// SPDX-License-Identifier: MIT
/**
 * Recipe Card Component
 *
 * Displays a single automation recipe with its status and actions.
 */

import { useState } from 'react';
import { Button, Badge } from '../common';
import type { RecipeCardInfo, RecipeIcon } from '@/types';
import { RECIPE_ICONS, CATEGORY_LABELS } from '@/types';
import clsx from 'clsx';

export interface RecipeCardProps {
  card: RecipeCardInfo;
  onEnable: () => void;
  onDisable: () => void;
  onCustomize: () => void;
  onTest?: () => void;
  isEnabling?: boolean;
  isDisabling?: boolean;
}

const iconColorByCategory: Record<string, { bg: string; text: string }> = {
  'code-quality': { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  'security': { bg: 'bg-red-500/10', text: 'text-red-400' },
  'testing': { bg: 'bg-green-500/10', text: 'text-green-400' },
  'git-workflow': { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  'validation': { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
};

const defaultColors = { bg: 'bg-blue-500/10', text: 'text-blue-400' };

export function RecipeCard({
  card,
  onEnable,
  onDisable,
  onCustomize,
  onTest,
  isEnabling = false,
  isDisabling = false,
}: RecipeCardProps) {
  const { recipe, isEnabled, isRecommended, recommendationReason } = card;
  const [showOptions, setShowOptions] = useState(false);

  const iconPath = RECIPE_ICONS[recipe.icon as RecipeIcon] || RECIPE_ICONS.code;
  const colors = iconColorByCategory[recipe.category] ?? defaultColors;
  const categoryLabel = CATEGORY_LABELS[recipe.category] || recipe.category;

  const handleToggle = () => {
    if (isEnabled) {
      onDisable();
    } else {
      onEnable();
    }
  };

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border transition-all',
        isEnabled
          ? 'border-green-500/30 bg-green-500/5'
          : isRecommended
          ? 'border-primary-500/30 bg-primary-500/5'
          : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={clsx('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', colors.bg)}>
          <svg
            className={clsx('w-5 h-5', colors.text)}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-white truncate">{recipe.name}</h4>
            {isEnabled && (
              <Badge variant="success" className="flex-shrink-0">
                Active
              </Badge>
            )}
            {isRecommended && !isEnabled && (
              <Badge variant="info" className="flex-shrink-0">
                Recommended
              </Badge>
            )}
          </div>

          <p className="text-sm text-surface-400 mb-2 line-clamp-2">
            {recipe.description}
          </p>

          {/* Recommendation reason */}
          {isRecommended && recommendationReason && !isEnabled && (
            <p className="text-xs text-primary-400 mb-2">
              {recommendationReason}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant={isEnabled ? 'danger' : 'primary'}
              size="sm"
              onClick={handleToggle}
              loading={isEnabling || isDisabling}
            >
              {isEnabling || isDisabling
                ? isEnabled
                  ? 'Disabling...'
                  : 'Enabling...'
                : isEnabled
                ? 'Disable'
                : 'Enable'}
            </Button>

            {isEnabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCustomize}
              >
                Customize
              </Button>
            )}

            {onTest && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onTest}
              >
                Test
              </Button>
            )}
          </div>

          {/* Options preview */}
          {recipe.options.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="text-xs text-surface-400 hover:text-white flex items-center gap-1"
              >
                <svg
                  className={clsx('w-3 h-3 transition-transform', showOptions && 'rotate-90')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {recipe.options.length} option{recipe.options.length !== 1 ? 's' : ''} available
              </button>

              {showOptions && (
                <div className="mt-2 pl-4 border-l-2 border-surface-700 space-y-1">
                  {recipe.options.map(opt => (
                    <div key={opt.id} className="text-xs text-surface-400">
                      <span className="text-surface-300">{opt.label}</span>
                      {opt.type === 'select' && opt.choices && (
                        <span className="ml-1">
                          ({opt.choices.length} choices)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category tag */}
      <div className="mt-3 pt-3 border-t border-surface-700/50">
        <span className="text-xs text-surface-500">{categoryLabel}</span>
      </div>
    </div>
  );
}

/**
 * Compact recipe card for the "Active Automations" list
 */
export interface CompactRecipeCardProps {
  card: RecipeCardInfo;
  onDisable: () => void;
  onCustomize: () => void;
  isDisabling?: boolean;
}

export function CompactRecipeCard({
  card,
  onDisable,
  onCustomize,
  isDisabling = false,
}: CompactRecipeCardProps) {
  const { recipe } = card;
  const iconPath = RECIPE_ICONS[recipe.icon as RecipeIcon] || RECIPE_ICONS.code;
  const colors = iconColorByCategory[recipe.category] ?? defaultColors;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-surface-700 bg-surface-800/30">
      <div className="flex items-center gap-3">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', colors.bg)}>
          <svg
            className={clsx('w-4 h-4', colors.text)}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
          </svg>
        </div>
        <div>
          <span className="font-medium text-white text-sm">{recipe.name}</span>
          <p className="text-xs text-surface-400 truncate max-w-xs">
            {recipe.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCustomize}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisable}
          loading={isDisabling}
        >
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
