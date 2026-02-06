// SPDX-License-Identifier: MIT
import { useState, useEffect, useMemo } from 'react';
import type { McpServer } from '@/types';
import { Modal, ModalFooter, Input, Card, Badge } from '../common';
import { useComponentLogger } from '@/hooks/useComponentLogger';

export interface AddMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (serverName: string, envVars: Record<string, string>) => Promise<void>;
  installedServers: string[];
}

export function AddMcpModal({
  isOpen,
  onClose,
  onAdd,
  installedServers,
}: AddMcpModalProps) {
  const logger = useComponentLogger('AddMcpModal', { logMount: false, logUnmount: false });

  const [allServers, setAllServers] = useState<McpServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Fetch servers
  useEffect(() => {
    if (isOpen) {
      const fetchServers = async () => {
        try {
          const res = await fetch('/api/mcp-servers');
          if (res.ok) {
            const data = await res.json();
            setAllServers(data.servers || []);
          }
        } catch (err) {
          logger.error('Failed to fetch MCP servers', err);
        } finally {
          setFetching(false);
        }
      };
      fetchServers();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedServer(null);
      setEnvVars({});
    }
  }, [isOpen]);

  // Filter available servers
  const availableServers = useMemo(() => {
    return allServers.filter((server) => !installedServers.includes(server.name));
  }, [allServers, installedServers]);

  const selectServer = (server: McpServer) => {
    setSelectedServer(server);
    // Initialize env vars with defaults
    const defaults: Record<string, string> = {};
    server.envVars.forEach((v) => {
      if (v.default) {
        defaults[v.name] = v.default;
      }
    });
    setEnvVars(defaults);
  };

  const handleAdd = async () => {
    if (!selectedServer) return;
    setLoading(true);
    try {
      await onAdd(selectedServer.name, envVars);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedServer(null);
    setEnvVars({});
  };

  // Check if all required env vars are filled
  const canSubmit = useMemo(() => {
    if (!selectedServer) return false;
    return selectedServer.envVars
      .filter((v) => v.required)
      .every((v) => envVars[v.name]?.trim());
  }, [selectedServer, envVars]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedServer ? `Configure ${selectedServer.name}` : 'Add MCP Server'}
      description={
        selectedServer
          ? selectedServer.description
          : 'Select an MCP server to add to your project'
      }
      size="lg"
      footer={
        selectedServer ? (
          <ModalFooter
            onCancel={handleBack}
            onConfirm={handleAdd}
            confirmText="Add Server"
            cancelText="Back"
            loading={loading}
            disabled={!canSubmit}
          />
        ) : undefined
      }
    >
      {fetching ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : !selectedServer ? (
        // Server Selection
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {availableServers.map((server) => (
            <Card
              key={server.name}
              selectable
              onClick={() => selectServer(server)}
              padding="sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">
                      {server.name}
                    </span>
                    <Badge variant="info" size="sm">
                      {server.category}
                    </Badge>
                    {server.envVars.some((v) => v.required) && (
                      <Badge variant="warning" size="sm">
                        Config Required
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-surface-400 mt-1">
                    {server.shortDescription || server.description}
                  </p>
                  <div className="text-xs text-surface-400 mt-1">
                    {server.tools.length} tools
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-surface-500 flex-shrink-0"
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

          {availableServers.length === 0 && (
            <div className="text-center py-8 text-surface-400">
              All MCP servers are already installed
            </div>
          )}
        </div>
      ) : (
        // Environment Variable Configuration
        <div className="space-y-4">
          {selectedServer.envVars.length > 0 ? (
            selectedServer.envVars.map((envVar) => (
              <div key={envVar.name}>
                <Input
                  label={
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{envVar.name}</span>
                      {envVar.required ? (
                        <Badge variant="danger" size="sm">Required</Badge>
                      ) : (
                        <Badge variant="default" size="sm">Optional</Badge>
                      )}
                    </span>
                  }
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
                  fullWidth
                />
              </div>
            ))
          ) : (
            <div className="p-4 bg-surface-700/30 rounded-lg text-sm text-surface-400 text-center">
              This server doesn't require any configuration.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
