// SPDX-License-Identifier: MIT
import { useState, useEffect, useMemo, useTransition } from 'react';
import type { Agent, AgentCategory } from '@/types';
import { Button, Input, Checkbox, Card, Badge } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';
import clsx from 'clsx';

export interface Step2AgentsProps {
  selectedAgents: string[];
  recommendedAgents: string[];
  onToggleAgent: (agentId: string) => void;
  onSelectAll: (agentIds: string[]) => void;
  onDeselectAll: () => void;
}

const categoryLabels: Record<AgentCategory, string> = {
  core: 'Core',
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  testing: 'Testing',
  infrastructure: 'Infrastructure',
  messaging: 'Messaging',
  security: 'Security',
  quality: 'Quality',
  general: 'General',
};

const categoryColors: Record<AgentCategory, string> = {
  core: 'bg-purple-500/10 text-purple-400',
  frontend: 'bg-blue-500/10 text-blue-400',
  backend: 'bg-green-500/10 text-green-400',
  database: 'bg-yellow-500/10 text-yellow-400',
  testing: 'bg-pink-500/10 text-pink-400',
  infrastructure: 'bg-orange-500/10 text-orange-400',
  messaging: 'bg-cyan-500/10 text-cyan-400',
  security: 'bg-red-500/10 text-red-400',
  quality: 'bg-indigo-500/10 text-indigo-400',
  general: 'bg-gray-500/10 text-gray-400',
};

export function Step2Agents({
  selectedAgents,
  recommendedAgents,
  onToggleAgent,
  onSelectAll,
  onDeselectAll,
}: Step2AgentsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AgentCategory | 'all'>('all');
  const [isPending, startTransition] = useTransition();

  // Fetch agents on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agents`);
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents || []);
        }
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  // Filtered and sorted agents
  const filteredAgents = useMemo(() => {
    return agents
      .filter((agent) => {
        const matchesSearch =
          searchQuery === '' ||
          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || agent.category === categoryFilter;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        // Sort recommended first
        const aRecommended = recommendedAgents.includes(a.id);
        const bRecommended = recommendedAgents.includes(b.id);
        if (aRecommended && !bRecommended) return -1;
        if (!aRecommended && bRecommended) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [agents, searchQuery, categoryFilter, recommendedAgents]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(agents.map((a) => a.category));
    return Array.from(cats).sort();
  }, [agents]);

  const handleSelectRecommended = () => {
    onSelectAll(recommendedAgents);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PanelSection
        title="Select Agents"
        description={`Choose the agents to install. ${selectedAgents.length} of ${agents.length} selected.`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleSelectRecommended}>
              Select Recommended
            </Button>
            <Button variant="ghost" size="sm" onClick={onDeselectAll}>
              Clear All
            </Button>
          </div>
        }
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value;
                // Urgent: update input immediately
                setSearchQuery(value);
              }}
              placeholder="Search agents..."
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => {
                startTransition(() => {
                  setCategoryFilter('all');
                });
              }}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                categoryFilter === 'all'
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  startTransition(() => {
                    setCategoryFilter(cat);
                  });
                }}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                  categoryFilter === cat
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                )}
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Agent Grid */}
        <div className={clsx(
          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-2 transition-opacity",
          isPending && "opacity-60"
        )}>
          {filteredAgents.map((agent) => {
            const isSelected = selectedAgents.includes(agent.id);
            const isRecommended = recommendedAgents.includes(agent.id);

            return (
              <Card
                key={agent.id}
                selectable
                selected={isSelected}
                onClick={() => onToggleAgent(agent.id)}
                padding="sm"
                className="relative"
              >
                <div className="flex items-start gap-3">
                  <Checkbox checked={isSelected} onChange={() => onToggleAgent(agent.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{agent.name}</span>
                      {isRecommended && (
                        <Badge variant="success" size="sm">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-surface-400 mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          categoryColors[agent.category]
                        )}
                      >
                        {categoryLabels[agent.category]}
                      </span>
                      {agent.skills.length > 0 && (
                        <span className="text-xs text-surface-400">
                          {agent.skills.length} skills
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filteredAgents.length === 0 && (
          <div className="text-center py-8 text-surface-400">
            No agents match your search criteria
          </div>
        )}
      </PanelSection>
    </div>
  );
}
