// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import { Card, Badge, Checkbox } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';

interface RuleMetadata {
  id: string;
  name: string;
  description: string;
  category: 'git' | 'docs';
  recommended: boolean;
}

export interface StepRulesProps {
  selectedRules: string[];
  onToggleRule: (ruleId: string) => void;
  onInitRules: (recommendedIds: string[]) => void;
}

const categoryLabels: Record<'git' | 'docs', string> = {
  git: 'Git & Versioning',
  docs: 'Documentation',
};

const categoryColors: Record<'git' | 'docs', string> = {
  git: 'bg-blue-500/10 text-blue-400',
  docs: 'bg-purple-500/10 text-purple-400',
};

export function StepRules({ selectedRules, onToggleRule, onInitRules }: StepRulesProps) {
  const [rules, setRules] = useState<RuleMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/rules`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const ruleList: RuleMetadata[] = data.data;
          setRules(ruleList);
          // Pre-select recommended rules only on first load
          if (!initialised && selectedRules.length === 0) {
            onInitRules(ruleList.filter(r => r.recommended).map(r => r.id));
            setInitialised(true);
          }
        } else {
          setError(data.error ?? 'Failed to load rules');
        }
      })
      .catch(() => setError('Could not connect to server'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <PanelSection title="Project Rules">
        <div className="flex items-center justify-center py-12">
          <svg className="w-5 h-5 animate-spin text-surface-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </PanelSection>
    );
  }

  if (error) {
    return (
      <PanelSection title="Project Rules">
        <p className="text-red-400 text-sm">{error}</p>
      </PanelSection>
    );
  }

  const byCategory = (['git', 'docs'] as const).map(cat => ({
    category: cat,
    label: categoryLabels[cat],
    rules: rules.filter(r => r.category === cat),
  })).filter(g => g.rules.length > 0);

  return (
    <PanelSection
      title="Project Rules"
      description="Claude Code agents will follow these guidelines when working in this project. Recommended rules are pre-selected."
    >
      <div className="space-y-6">
        {byCategory.map(({ category, label, rules: catRules }) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
              {label}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {catRules.map(rule => {
                const isSelected = selectedRules.includes(rule.id);
                return (
                  <Card
                    key={rule.id}
                    selectable
                    selected={isSelected}
                    onClick={() => onToggleRule(rule.id)}
                    padding="sm"
                  >
                    <div className="flex items-start gap-3">
                      {/* pointer-events-none: Card.onClick is the single toggle handler */}
                      <Checkbox checked={isSelected} onChange={() => {}} className="pointer-events-none mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white text-sm">{rule.name}</span>
                          {rule.recommended && (
                            <Badge variant="success" size="sm">Recommended</Badge>
                          )}
                        </div>
                        <p className="text-xs text-surface-400 mt-1">{rule.description}</p>
                        <span className={`inline-block text-xs px-2 py-0.5 rounded mt-2 ${categoryColors[rule.category]}`}>
                          {categoryLabels[rule.category]}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedRules.length === 0 && (
        <p className="text-surface-500 text-xs mt-4">
          No rules selected — you can add them later via the Manage panel.
        </p>
      )}
    </PanelSection>
  );
}
