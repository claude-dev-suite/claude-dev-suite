// SPDX-License-Identifier: MIT
/**
 * Step 0a: Template Selection
 *
 * Allows the user to browse and select a project template.
 * Features category filters, search, and technology badges.
 */

import { memo, useState, useMemo, useCallback } from 'react';
import type { TemplateListItem, TemplateCategory } from '@/types';
import { TEMPLATE_CATEGORY_LABELS, TEMPLATE_CATEGORY_BADGE_CLASSES } from '@/types';
import { useTemplates } from '@/hooks';
import { PanelSection } from '../layout';
import { Input, Badge, Spinner } from '../common';

// ============================================
// TEMPLATE CARD COMPONENT
// ============================================

interface TemplateCardProps {
  template: TemplateListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}

const TemplateCard = memo(function TemplateCard({
  template,
  selected,
  onSelect,
}: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template.id)}
      className={`flex flex-col items-start p-4 rounded-lg border transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900 ${
        selected
          ? 'bg-primary-500/10 border-primary-500 ring-1 ring-primary-500/50'
          : 'bg-surface-800 border-surface-700 hover:border-surface-600 hover:bg-surface-700/50'
      }`}
    >
      {/* Header with category badge */}
      <div className="flex items-start justify-between w-full mb-2">
        <h4 className={`font-medium ${selected ? 'text-primary-400' : 'text-white'}`}>
          {template.name}
        </h4>
        <Badge
          className={`text-xs ${TEMPLATE_CATEGORY_BADGE_CLASSES[template.category]}`}
        >
          {TEMPLATE_CATEGORY_LABELS[template.category]}
        </Badge>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{template.description}</p>

      {/* Technologies */}
      <div className="flex flex-wrap gap-1">
        {template.technologies.slice(0, 5).map((tech) => (
          <span
            key={tech}
            className="px-2 py-0.5 text-xs bg-surface-700 text-gray-300 rounded"
          >
            {tech}
          </span>
        ))}
        {template.technologies.length > 5 && (
          <span className="px-2 py-0.5 text-xs text-gray-500">
            +{template.technologies.length - 5} more
          </span>
        )}
      </div>

      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-2 right-2">
          <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </button>
  );
});

// ============================================
// CATEGORY FILTER COMPONENT
// ============================================

interface CategoryFilterProps {
  selected: TemplateCategory | 'all';
  onChange: (category: TemplateCategory | 'all') => void;
  counts: Record<TemplateCategory | 'all', number>;
}

const CategoryFilter = memo(function CategoryFilter({
  selected,
  onChange,
  counts,
}: CategoryFilterProps) {
  const categories: (TemplateCategory | 'all')[] = ['all', 'frontend', 'backend', 'fullstack'];

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            selected === category
              ? 'bg-primary-500 text-white'
              : 'bg-surface-700 text-gray-300 hover:bg-surface-600'
          }`}
        >
          {category === 'all' ? 'All' : TEMPLATE_CATEGORY_LABELS[category]}
          <span className="ml-1.5 text-xs opacity-70">({counts[category]})</span>
        </button>
      ))}
    </div>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

export interface Step0TemplateSelectProps {
  selectedTemplate: string | null;
  onTemplateSelect: (templateId: string) => void;
}

export const Step0TemplateSelect = memo(function Step0TemplateSelect({
  selectedTemplate,
  onTemplateSelect,
}: Step0TemplateSelectProps) {
  const { templates, loading, error } = useTemplates();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all'>('all');

  // Calculate category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<TemplateCategory | 'all', number> = {
      all: templates.length,
      frontend: 0,
      backend: 0,
      fullstack: 0,
    };

    for (const template of templates) {
      counts[template.category]++;
    }

    return counts;
  }, [templates]);

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Apply category filter
    if (categoryFilter !== 'all') {
      result = result.filter((t) => t.category === categoryFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          t.technologies.some((tech) => tech.toLowerCase().includes(query))
      );
    }

    return result;
  }, [templates, categoryFilter, searchQuery]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  if (loading) {
    return (
      <PanelSection title="Select a Template">
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3 text-gray-400">Loading templates...</span>
        </div>
      </PanelSection>
    );
  }

  if (error) {
    return (
      <PanelSection title="Select a Template">
        <div className="flex items-center justify-center py-12 text-red-400">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Failed to load templates: {error}
        </div>
      </PanelSection>
    );
  }

  return (
    <PanelSection
      title="Select a Template"
      description="Choose a project template to scaffold your new project"
    >
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full"
            leftIcon={
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            }
          />
        </div>

        {/* Category filters */}
        <CategoryFilter
          selected={categoryFilter}
          onChange={setCategoryFilter}
          counts={categoryCounts}
        />
      </div>

      {/* Template Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p>No templates found matching your criteria</p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-primary-400 hover:text-primary-300"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={selectedTemplate === template.id}
              onSelect={onTemplateSelect}
            />
          ))}
        </div>
      )}

      {/* Selection summary */}
      {selectedTemplate && (
        <div className="mt-6 p-4 bg-primary-500/10 border border-primary-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-primary-400 font-medium">
              Selected: {templates.find((t) => t.id === selectedTemplate)?.name}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Click Continue to configure project details
          </p>
        </div>
      )}
    </PanelSection>
  );
});
