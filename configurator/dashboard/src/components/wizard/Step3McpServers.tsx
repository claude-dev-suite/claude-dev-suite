// SPDX-License-Identifier: MIT
import { useState, useEffect, useMemo } from 'react';
import type { McpServer, McpServerCategory } from '@/types';
import { Input, Checkbox, Card, Badge } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';
import clsx from 'clsx';

export interface Step3McpServersProps {
  selectedMcpServers: string[];
  recommendedMcpServers: string[];
  selectedAgents: string[];
  onToggleMcpServer: (serverName: string) => void;
}

const categoryLabels: Record<McpServerCategory, string> = {
  knowledge: 'Knowledge',
  database: 'Database',
  infrastructure: 'Infrastructure',
  api: 'API',
  git: 'Git',
  observability: 'Observability',
  performance: 'Performance',
  quality: 'Quality',
  security: 'Security',
  integration: 'Integration',
  general: 'General',
};

const categoryColors: Record<McpServerCategory, string> = {
  knowledge: 'bg-purple-500/10 text-purple-400',
  database: 'bg-yellow-500/10 text-yellow-400',
  infrastructure: 'bg-orange-500/10 text-orange-400',
  api: 'bg-blue-500/10 text-blue-400',
  git: 'bg-green-500/10 text-green-400',
  observability: 'bg-cyan-500/10 text-cyan-400',
  performance: 'bg-pink-500/10 text-pink-400',
  quality: 'bg-indigo-500/10 text-indigo-400',
  security: 'bg-red-500/10 text-red-400',
  integration: 'bg-teal-500/10 text-teal-400',
  general: 'bg-gray-500/10 text-gray-400',
};

export function Step3McpServers({
  selectedMcpServers,
  recommendedMcpServers,
  selectedAgents,
  onToggleMcpServer,
}: Step3McpServersProps) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch MCP servers on mount
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/mcp-servers`);
        if (res.ok) {
          const data = await res.json();
          setServers(data.servers || []);
        }
      } catch (err) {
        console.error('Failed to fetch MCP servers:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchServers();
  }, []);

  // Calculate required servers based on selected agents
  const requiredServers = useMemo(() => {
    const required = new Set<string>();
    servers.forEach((server) => {
      server.requiredFor.forEach((agentId) => {
        if (selectedAgents.includes(agentId)) {
          required.add(server.name);
        }
      });
    });
    return required;
  }, [servers, selectedAgents]);

  // Filtered and sorted servers
  const filteredServers = useMemo(() => {
    return servers
      .filter((server) => {
        return (
          searchQuery === '' ||
          server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          server.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
      .sort((a, b) => {
        // Sort required first, then recommended, then alphabetical
        const aRequired = requiredServers.has(a.name);
        const bRequired = requiredServers.has(b.name);
        const aRecommended = recommendedMcpServers.includes(a.name);
        const bRecommended = recommendedMcpServers.includes(b.name);

        if (aRequired && !bRequired) return -1;
        if (!aRequired && bRequired) return 1;
        if (aRecommended && !bRecommended) return -1;
        if (!aRecommended && bRecommended) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [servers, searchQuery, requiredServers, recommendedMcpServers]);

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
        title="Configure MCP Servers"
        description={`Select the MCP servers to enable. ${selectedMcpServers.length} of ${servers.length} selected.`}
      >
        {/* Search */}
        <div className="mb-6">
          <Input
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              // Urgent: update input immediately
              setSearchQuery(value);
            }}
            placeholder="Search MCP servers..."
            fullWidth
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

        {/* Required Servers Notice */}
        {requiredServers.size > 0 && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>
                {requiredServers.size} server(s) required by selected agents
              </span>
            </div>
          </div>
        )}

        {/* Server Grid */}
        <div className={clsx(
          "grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 transition-opacity"
        )}>
          {filteredServers.map((server) => {
            const isSelected = selectedMcpServers.includes(server.name);
            const isRequired = requiredServers.has(server.name);
            const isRecommended = recommendedMcpServers.includes(server.name);
            const hasEnvVars = server.envVars.some((v) => v.required);

            return (
              <Card
                key={server.name}
                selectable
                selected={isSelected}
                onClick={() => !isRequired && onToggleMcpServer(server.name)}
                padding="md"
                className={clsx(isRequired && 'cursor-not-allowed')}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected || isRequired}
                    onChange={() => !isRequired && onToggleMcpServer(server.name)}
                    disabled={isRequired}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{server.name}</span>
                      {isRequired && (
                        <Badge variant="warning" size="sm">
                          Required
                        </Badge>
                      )}
                      {isRecommended && !isRequired && (
                        <Badge variant="success" size="sm">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-surface-400 mt-1">
                      {server.shortDescription || server.description}
                    </p>

                    <div className="flex items-center gap-3 mt-3">
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          categoryColors[server.category]
                        )}
                      >
                        {categoryLabels[server.category]}
                      </span>
                      <span className="text-xs text-surface-400">
                        {server.tools.length} tools
                      </span>
                      {hasEnvVars && (
                        <span className="text-xs text-yellow-400 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                            />
                          </svg>
                          Config needed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filteredServers.length === 0 && (
          <div className="text-center py-8 text-surface-400">
            No MCP servers match your search
          </div>
        )}
      </PanelSection>
    </div>
  );
}
