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

  // Calculate servers recommended by selected agents
  const agentRecommendedServers = useMemo(() => {
    const recommended = new Set<string>();
    servers.forEach((server) => {
      server.recommendedFor.forEach((agentId) => {
        if (agentId === 'all' || selectedAgents.includes(agentId)) {
          recommended.add(server.name);
        }
      });
    });
    return recommended;
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
        // Sort recommended first (by agents or by detection), then alphabetical
        const aByAgent = agentRecommendedServers.has(a.name);
        const bByAgent = agentRecommendedServers.has(b.name);
        const aRecommended = recommendedMcpServers.includes(a.name);
        const bRecommended = recommendedMcpServers.includes(b.name);

        if (aByAgent && !bByAgent) return -1;
        if (!aByAgent && bByAgent) return 1;
        if (aRecommended && !bRecommended) return -1;
        if (!aRecommended && bRecommended) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [servers, searchQuery, agentRecommendedServers, recommendedMcpServers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const lazyEnabled = selectedMcpServers.includes('skill-loader');

  return (
    <div className="space-y-6">
      {lazyEnabled && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300">
          <strong>Lazy skill loading enabled.</strong> Selecting <code>skill-loader</code> switches the
          install to a hybrid model: skills referenced by the agents you picked are installed natively
          (Claude Code auto-discovers them, body loaded on-demand) — all other skills stay reachable
          via the <code>skill-loader</code> MCP server. <code>DEV_SUITE_ROOT</code> is pre-filled in
          the next step with the dev-suite bundle shipped with this Dashboard.
        </div>
      )}
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

        {/* Recommended Servers Notice */}
        {agentRecommendedServers.size > 0 && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                {agentRecommendedServers.size} server(s) recommended for your selected agents — agents work without them but perform better with them
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
            const isRecommendedByAgent = agentRecommendedServers.has(server.name);
            const isRecommended = recommendedMcpServers.includes(server.name);
            const hasEnvVars = server.envVars.some((v) => v.required);

            return (
              <Card
                key={server.name}
                selectable
                selected={isSelected}
                onClick={() => onToggleMcpServer(server.name)}
                padding="md"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggleMcpServer(server.name)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{server.name}</span>
                      {isRecommendedByAgent && (
                        <Badge variant="info" size="sm">
                          Recommended
                        </Badge>
                      )}
                      {isRecommended && !isRecommendedByAgent && (
                        <Badge variant="success" size="sm">
                          Detected
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
