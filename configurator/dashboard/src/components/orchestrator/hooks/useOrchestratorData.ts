// SPDX-License-Identifier: MIT
/**
 * Hook for fetching orchestrator data (agents, components, commands, workflows)
 */

import { useState, useEffect } from 'react';
import type { Agent } from '@/types';
import type { Workflow } from '../WorkflowSelector';
import type { AutocompleteItem } from '../ChatInput';
import { API_BASE } from '@/utils/api';
import { useComponentLogger } from '@/hooks/useComponentLogger';
import { useProjectStore } from '@/stores/project.store';

export interface OrchestratorData {
  availableAgents: Agent[];
  installedAgents: string[];
  installedMcpServers: string[];
  projectCommands: AutocompleteItem[];
  workflows: { builtin: Workflow[]; custom: Workflow[] };
}

export function useOrchestratorData(projectPath: string): OrchestratorData {
  const logger = useComponentLogger('useOrchestratorData', { logMount: false, logUnmount: false });

  // Subscribe to components version to re-fetch when agents/MCP change
  const componentsVersion = useProjectStore((s) => s.componentsVersion);

  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [installedAgents, setInstalledAgents] = useState<string[]>([]);
  const [installedMcpServers, setInstalledMcpServers] = useState<string[]>([]);
  const [projectCommands, setProjectCommands] = useState<AutocompleteItem[]>([]);
  const [workflows, setWorkflows] = useState<{ builtin: Workflow[]; custom: Workflow[] }>({
    builtin: [],
    custom: [],
  });

  // Fetch available agents (re-fetches when componentsVersion changes)
  useEffect(() => {
    if (!projectPath) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agents?projectPath=${encodeURIComponent(projectPath)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setAvailableAgents(data.agents || []);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError' && mounted) {
          logger.error('Failed to fetch agents', err);
        }
      }
    };
    fetchAgents();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [projectPath, componentsVersion, logger]);

  // Fetch installed components (re-fetches when componentsVersion changes)
  useEffect(() => {
    if (!projectPath) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchInstalled = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/installed-components?path=${encodeURIComponent(projectPath)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setInstalledAgents(data.agents || []);
            setInstalledMcpServers(data.mcpServers || []);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError' && mounted) {
          logger.error('Failed to fetch installed components', err);
        }
      }
    };
    fetchInstalled();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [projectPath, componentsVersion, logger]);

  // Fetch project commands
  useEffect(() => {
    if (!projectPath) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchCommands = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/available-commands?path=${encodeURIComponent(projectPath)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            const commands: AutocompleteItem[] = (data.commands || []).map((c: { name: string; description?: string }) => ({
              name: c.name,
              description: c.description || '',
              icon: '📄',
            }));
            setProjectCommands(commands);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError' && mounted) {
          logger.error('Failed to fetch project commands', err);
        }
      }
    };
    fetchCommands();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [projectPath, logger]);

  // Fetch workflows
  useEffect(() => {
    if (!projectPath) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchWorkflows = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/orchestrator/workflows?project_path=${encodeURIComponent(projectPath)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setWorkflows(data);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError' && mounted) {
          logger.error('Failed to fetch workflows', err);
        }
      }
    };
    fetchWorkflows();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [projectPath, logger]);

  return {
    availableAgents,
    installedAgents,
    installedMcpServers,
    projectCommands,
    workflows,
  };
}
