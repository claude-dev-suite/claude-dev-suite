// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import type { McpServer, NewComponent } from '@/types';
import { Button, Card, Badge, Modal, ModalFooter, Input } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';
import { getLogger } from '@/utils/logger';
import { useProjectStore } from '@/stores/project.store';

const log = getLogger('McpServersList');

export interface McpServersListProps {
  projectPath: string;
  installedServers: string[];
  newMcpServers?: NewComponent[];
  onRefresh: () => void;
}

export function McpServersList({ projectPath, installedServers, newMcpServers = [], onRefresh }: McpServersListProps) {
  log.info('Component mounting', { projectPath, installedServers });
  const invalidateComponents = useProjectStore((s) => s.invalidateComponents);

  const [allServers, setAllServers] = useState<McpServer[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addingNewServer, setAddingNewServer] = useState<string | null>(null);
  const [dismissedNew, setDismissedNew] = useState(false);

  // Fetch all available servers
  useEffect(() => {
    log.info('useEffect: Fetching MCP servers...');
    const fetchServers = async () => {
      try {
        const url = `${API_BASE}/api/mcp-servers`;
        log.debug('Fetching from:', url);
        const res = await fetch(url);
        log.debug('Response status:', res.status);
        if (res.ok) {
          const data = await res.json();
          log.info('Received servers:', data);
          setAllServers(data.servers || []);
          setFetchError(null);
        } else {
          const errorText = await res.text();
          log.error('Failed to fetch servers:', { status: res.status, body: errorText });
          setFetchError(`HTTP ${res.status}: ${errorText}`);
        }
      } catch (err) {
        log.error('Failed to fetch MCP servers:', err);
        setFetchError(err instanceof Error ? err.message : 'Unknown error');
      }
    };
    fetchServers();
  }, []);

  const handleRemove = async (serverName: string) => {
    if (!confirm(`Remove MCP server "${serverName}"?`)) return;

    setRemoving(serverName);
    try {
      const res = await fetch(`${API_BASE}/api/remove-mcp-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName, projectPath }),
      });
      if (res.ok) {
        onRefresh();
        invalidateComponents(); // Notify orchestrator to refresh
      }
    } catch (err) {
      log.error('Failed to remove server', err);
    } finally {
      setRemoving(null);
    }
  };

  const handleAdd = async () => {
    if (!selectedServer) return;

    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/api/add-mcp-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: selectedServer.name,
          projectPath,
          envVars,
        }),
      });
      if (res.ok) {
        onRefresh();
        invalidateComponents(); // Notify orchestrator to refresh
        setShowAddModal(false);
        setSelectedServer(null);
        setEnvVars({});
      }
    } catch (err) {
      log.error('Failed to add server', err);
    } finally {
      setAdding(false);
    }
  };

  const selectServerToAdd = (server: McpServer) => {
    setSelectedServer(server);
    // Initialize env vars with defaults
    const defaults: Record<string, string> = {};
    (server.envVars || []).forEach((v) => {
      if (v.default) {
        defaults[v.name] = v.default;
      }
    });
    setEnvVars(defaults);
  };

  const handleAddNewServer = async (serverName: string) => {
    setAddingNewServer(serverName);
    try {
      const res = await fetch(`${API_BASE}/api/add-mcp-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName, projectPath, envVars: {} }),
      });
      if (res.ok) {
        onRefresh();
        invalidateComponents();
      }
    } catch (err) {
      log.error('Failed to add new MCP server', err);
    } finally {
      setAddingNewServer(null);
    }
  };

  const handleAddAllNewServers = async () => {
    setAddingNewServer('__all__');
    try {
      for (const server of newMcpServers) {
        await fetch(`${API_BASE}/api/add-mcp-server`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverName: server.id, projectPath, envVars: {} }),
        });
      }
      onRefresh();
      invalidateComponents();
    } catch (err) {
      log.error('Failed to add all new MCP servers', err);
    } finally {
      setAddingNewServer(null);
    }
  };

  // Get server details
  const getServerDetails = (serverName: string) => {
    return allServers.find((s) => s.name === serverName);
  };

  // Available servers to add
  const availableToAdd = allServers.filter((s) => !installedServers.includes(s.name));

  log.debug('Rendering component', {
    allServersCount: allServers.length,
    installedCount: installedServers.length,
    availableToAddCount: availableToAdd.length,
    fetchError
  });

  // Show error if fetch failed
  if (fetchError) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <h3 className="text-red-400 font-medium mb-2">Error Loading MCP Servers</h3>
        <p className="text-red-300 text-sm">{fetchError}</p>
        <p className="text-surface-400 text-xs mt-2">Check the logs at: %APPDATA%\Dev-Suite Dashboard\logs\</p>
      </div>
    );
  }

  const visibleNewServers = dismissedNew ? [] : newMcpServers;

  return (
    <div className="space-y-6">
      {/* New MCP Servers Available Section */}
      {visibleNewServers.length > 0 && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant="info">{visibleNewServers.length}</Badge>
              <h3 className="text-sm font-medium text-white">New MCP Servers Available</h3>
              <span className="text-xs text-surface-400">Added after your installation</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAddAllNewServers}
                loading={addingNewServer === '__all__'}
                disabled={addingNewServer !== null}
              >
                Add All New
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissedNew(true)}
              >
                Dismiss
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {visibleNewServers.map((server) => (
              <Card key={server.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{server.name}</span>
                      <Badge variant="default" size="sm">{server.category}</Badge>
                      <Badge variant="info" size="sm">NEW</Badge>
                    </div>
                    <p className="text-xs text-surface-400 mt-1">{server.description}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddNewServer(server.id)}
                    loading={addingNewServer === server.id}
                    disabled={addingNewServer !== null}
                  >
                    Add
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <PanelSection
        title="Installed MCP Servers"
        description={`${installedServers.length} server(s) installed`}
        actions={
          <Button onClick={() => setShowAddModal(true)} size="sm">
            Add MCP Server
          </Button>
        }
      >
        <div className="space-y-3">
          {installedServers.map((serverName) => {
            const server = getServerDetails(serverName);
            return (
              <Card key={serverName} padding="md">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {serverName}
                      </span>
                      {server?.category && (
                        <Badge variant="info">{server.category}</Badge>
                      )}
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        Configured
                      </span>
                    </div>
                    {server?.shortDescription && (
                      <p className="text-sm text-surface-400 mt-1">
                        {server.shortDescription}
                      </p>
                    )}
                    {server?.tools && server.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(server.tools || []).slice(0, 4).map((tool, idx) => {
                          // Handle both string tools and object tools {name, description}
                          const toolName = typeof tool === 'string' ? tool : (tool as {name: string}).name;
                          return (
                            <span
                              key={toolName || idx}
                              className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-300 font-mono"
                            >
                              {toolName}
                            </span>
                          );
                        })}
                        {(server.tools || []).length > 4 && (
                          <span className="text-xs text-surface-400">
                            +{(server.tools || []).length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(serverName)}
                    loading={removing === serverName}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            );
          })}

          {installedServers.length === 0 && (
            <div className="text-center py-8 text-surface-400">
              No MCP servers installed. Click "Add MCP Server" to get started.
            </div>
          )}
        </div>
      </PanelSection>

      {/* Add MCP Server Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedServer(null);
          setEnvVars({});
        }}
        title={selectedServer ? `Configure ${selectedServer.name}` : 'Add MCP Server'}
        size="lg"
        footer={
          selectedServer ? (
            <ModalFooter
              onCancel={() => setSelectedServer(null)}
              onConfirm={handleAdd}
              confirmText="Add Server"
              cancelText="Back"
              loading={adding}
            />
          ) : undefined
        }
      >
        {!selectedServer ? (
          // Server Selection
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {availableToAdd.map((server) => (
              <Card
                key={server.name}
                selectable
                onClick={() => selectServerToAdd(server)}
                padding="sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-surface-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {server.name}
                      </span>
                      <Badge variant="default" size="sm">
                        {server.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-surface-400 mt-1">
                      {server.shortDescription || server.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-surface-400">
                      <span>{(server.tools || []).length} tools</span>
                      {(server.envVars || []).some((v) => v.required) && (
                        <span className="text-yellow-400">Config required</span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-surface-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Card>
            ))}

            {availableToAdd.length === 0 && (
              <div className="text-center py-8 text-surface-400">
                All available MCP servers are already installed.
              </div>
            )}
          </div>
        ) : (
          // Env Var Configuration
          <div className="space-y-4">
            <p className="text-sm text-surface-400">
              {selectedServer.description}
            </p>

            {(selectedServer.envVars || []).length > 0 ? (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-surface-300">
                  Environment Variables
                </h4>
                {(selectedServer.envVars || []).map((envVar) => (
                  <div key={envVar.name}>
                    <Input
                      label={envVar.name}
                      type={
                        envVar.name.toLowerCase().includes('secret') ||
                        envVar.name.toLowerCase().includes('password') ||
                        envVar.name.toLowerCase().includes('token')
                          ? 'password'
                          : 'text'
                      }
                      value={envVars[envVar.name] || ''}
                      onChange={(e) =>
                        setEnvVars((prev) => ({
                          ...prev,
                          [envVar.name]: e.target.value,
                        }))
                      }
                      placeholder={envVar.default || 'Enter value...'}
                      helperText={envVar.description}
                      error={
                        envVar.required && !envVars[envVar.name]
                          ? 'Required'
                          : undefined
                      }
                      fullWidth
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-surface-700/30 rounded-lg text-sm text-surface-400">
                This MCP server doesn't require any configuration.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
