// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import type { InstalledComponentsResponse } from '@/types';
import { AgentsList } from './AgentsList';
import { McpServersList } from './McpServersList';
import { HooksConfig } from './HooksConfig';
import { AutomationsPanel } from './AutomationsPanel';
import { UpdatesTab } from './UpdatesTab';
import { CustomAgentsPanel } from './CustomAgentsPanel';
import { Button, Badge, ErrorBoundary, ErrorMessage } from '../common';
import { apiGet, API_BASE } from '@/utils/api';
import { ApiError, getUserErrorMessage } from '@/utils/errors';
import clsx from 'clsx';

export interface ManagePanelProps {
  projectPath: string;
  onUninstall?: () => void;
}

type Tab = 'agents' | 'custom-agents' | 'mcp' | 'automations' | 'hooks' | 'updates';

export function ManagePanel({ projectPath, onUninstall }: ManagePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('agents');
  const [installedData, setInstalledData] = useState<InstalledComponentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorObj, setErrorObj] = useState<ApiError | null>(null);

  // Fetch installed components
  const fetchInstalled = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorObj(null);
      const data = await apiGet<InstalledComponentsResponse>(
        `/api/installed-components?path=${encodeURIComponent(projectPath)}`
      );
      setInstalledData(data);
    } catch (err) {
      const errorObject = err instanceof ApiError ? err : null;
      setError(getUserErrorMessage(err));
      setErrorObj(errorObject);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstalled();
  }, [projectPath]);

  const handleUninstall = async () => {
    if (!confirm('Are you sure you want to uninstall Dev-Suite from this project?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Uninstall failed');
      }

      // Refresh the installed data to reflect changes
      await fetchInstalled();
      onUninstall?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage
          error={error}
          errorObj={errorObj}
          isNetworkError={errorObj?.isNetworkError}
          isValidationError={errorObj?.isClientError}
          isServerError={errorObj?.isServerError}
          onRetry={fetchInstalled}
        />
      </div>
    );
  }

  if (!installedData?.installed) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-16 h-16 mx-auto text-surface-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-lg font-medium text-surface-300 mb-2">
          Dev-Suite Not Installed
        </h3>
        <p className="text-sm text-surface-400">
          Use the Setup Wizard to install Dev-Suite in this project.
        </p>
      </div>
    );
  }

  const tabs = [
    { id: 'agents' as Tab, label: 'Agents', count: installedData.agents.length },
    { id: 'custom-agents' as Tab, label: 'Custom Agents' },
    { id: 'mcp' as Tab, label: 'MCP Servers', count: installedData.mcpServers.length },
    { id: 'automations' as Tab, label: 'Automations' },
    { id: 'hooks' as Tab, label: 'Hooks (Advanced)' },
    { id: 'updates' as Tab, label: 'Updates' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Manage Installation</h2>
          <p className="text-sm text-surface-400 mt-1">
            Installed at: {projectPath}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={fetchInstalled}>
            Refresh
          </Button>
          <Button variant="danger" onClick={handleUninstall}>
            Uninstall
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-700">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-white hover:border-surface-500'
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <Badge variant="default" className="ml-2">
                  {tab.count}
                </Badge>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        <ErrorBoundary>
          {activeTab === 'agents' && (
            <AgentsList
              projectPath={projectPath}
              installedAgents={installedData.agents}
              onRefresh={fetchInstalled}
            />
          )}
          {activeTab === 'custom-agents' && (
            <CustomAgentsPanel projectPath={projectPath} />
          )}
          {activeTab === 'mcp' && (
            <McpServersList
              projectPath={projectPath}
              installedServers={installedData.mcpServers}
              onRefresh={fetchInstalled}
            />
          )}
          {activeTab === 'automations' && (
            <AutomationsPanel projectPath={projectPath} />
          )}
          {activeTab === 'hooks' && (
            <HooksConfig projectPath={projectPath} />
          )}
          {activeTab === 'updates' && (
            <UpdatesTab projectPath={projectPath} />
          )}
        </ErrorBoundary>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
