// SPDX-License-Identifier: MIT
import { useState, useEffect, useMemo } from 'react';
import type { EnvVarWithDetection, EnvironmentMap } from '@/types';
import { Input, Select, Badge } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';

export interface Step4EnvironmentProps {
  projectPath: string;
  selectedMcpServers: string[];
  envVars: Record<string, string>;
  onEnvVarChange: (name: string, value: string) => void;
}

export function Step4Environment({
  projectPath,
  selectedMcpServers,
  envVars,
  onEnvVarChange,
}: Step4EnvironmentProps) {
  const [environments, setEnvironments] = useState<EnvironmentMap>({});
  const [selectedEnv, setSelectedEnv] = useState<string>('');
  const [requiredEnvVars, setRequiredEnvVars] = useState<EnvVarWithDetection[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch environments
  useEffect(() => {
    const fetchEnvironments = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/environments?path=${encodeURIComponent(projectPath)}`);
        if (res.ok) {
          const data = await res.json();
          setEnvironments(data.environments || {});
          // Auto-select first environment
          const envNames = Object.keys(data.environments || {});
          const firstEnv = envNames[0];
          if (firstEnv && !selectedEnv) {
            setSelectedEnv(firstEnv);
          }
        }
      } catch (err) {
        console.error('Failed to fetch environments:', err);
      }
    };
    fetchEnvironments();
  }, [projectPath]);

  // Fetch required env vars for selected MCP servers
  useEffect(() => {
    const fetchEnvVars = async () => {
      if (selectedMcpServers.length === 0) {
        setRequiredEnvVars([]);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/env-vars`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverNames: selectedMcpServers,
            projectPath,
            selectedEnv,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setRequiredEnvVars(data.envVars || []);

          // Auto-populate detected values
          (data.envVars || []).forEach((envVar: EnvVarWithDetection) => {
            if (envVar.detectedValue && !envVars[envVar.name]) {
              onEnvVarChange(envVar.name, envVar.detectedValue);
            }
          });
        }
      } catch (err) {
        console.error('Failed to fetch env vars:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEnvVars();
  }, [selectedMcpServers, projectPath, selectedEnv]);

  // Environment options for select
  const envOptions = useMemo(() => {
    return Object.entries(environments).map(([key, env]) => ({
      value: key,
      label: env.label,
      description: env.source,
    }));
  }, [environments]);

  // Group env vars by MCP server
  const groupedEnvVars = useMemo(() => {
    const groups: Record<string, EnvVarWithDetection[]> = {};
    requiredEnvVars.forEach((envVar) => {
      const server = envVar.mcpServer || 'General';
      if (!groups[server]) {
        groups[server] = [];
      }
      groups[server].push(envVar);
    });
    return groups;
  }, [requiredEnvVars]);

  // Validation
  const missingRequired = useMemo(() => {
    return requiredEnvVars.filter(
      (v) => v.required && !envVars[v.name] && !v.detectedValue
    );
  }, [requiredEnvVars, envVars]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Environment Selection */}
      {envOptions.length > 0 && (
        <PanelSection
          title="Environment"
          description="Select an environment file to auto-detect variable values"
        >
          <Select
            options={envOptions}
            value={selectedEnv}
            onChange={(value) => setSelectedEnv(value as string)}
            placeholder="Select environment..."
            fullWidth
          />
        </PanelSection>
      )}

      {/* Environment Variables */}
      <PanelSection
        title="Environment Variables"
        description={
          requiredEnvVars.length > 0
            ? `Configure ${requiredEnvVars.length} environment variable(s) for the selected MCP servers`
            : 'No environment variables required for the selected MCP servers'
        }
      >
        {/* Validation Warning */}
        {missingRequired.length > 0 && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>
                {missingRequired.length} required variable(s) need values
              </span>
            </div>
          </div>
        )}

        {/* Grouped Variables */}
        {Object.entries(groupedEnvVars).map(([serverName, vars]) => (
          <div key={serverName} className="mb-6 last:mb-0">
            <h4 className="text-sm font-medium text-surface-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-500" />
              {serverName}
            </h4>
            <div className="space-y-4">
              {vars.map((envVar) => {
                const currentValue = envVars[envVar.name] || envVar.detectedValue || '';
                const isDetected = !!envVar.detectedValue;

                return (
                  <div
                    key={envVar.name}
                    className="p-4 bg-surface-700/30 rounded-lg border border-surface-700"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-sm text-white">{envVar.name}</span>
                      {envVar.required ? (
                        <Badge variant="danger" size="sm">Required</Badge>
                      ) : (
                        <Badge variant="default" size="sm">Optional</Badge>
                      )}
                      {isDetected && (
                        <Badge variant="success" size="sm">Auto-detected</Badge>
                      )}
                    </div>
                    <p className="text-xs text-surface-400 mb-3">{envVar.description}</p>
                    <Input
                      type={envVar.name.toLowerCase().includes('secret') ||
                            envVar.name.toLowerCase().includes('password') ||
                            envVar.name.toLowerCase().includes('token') ? 'password' : 'text'}
                      value={currentValue}
                      onChange={(e) => onEnvVarChange(envVar.name, e.target.value)}
                      placeholder={envVar.default || 'Enter value...'}
                      helperText={isDetected ? `Source: ${envVar.source}` : undefined}
                      fullWidth
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {requiredEnvVars.length === 0 && (
          <div className="text-center py-8 text-surface-400">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-surface-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p>No configuration needed for the selected MCP servers</p>
          </div>
        )}
      </PanelSection>
    </div>
  );
}
