// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import type { Agent } from '@/types';
import { Button, Card, Badge, Modal, ModalFooter, Checkbox } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';
import { useComponentLogger } from '@/hooks/useComponentLogger';
import { useProjectStore } from '@/stores/project.store';

export interface AgentsListProps {
  projectPath: string;
  installedAgents: string[];
  onRefresh: () => void;
}

export function AgentsList({ projectPath, installedAgents, onRefresh }: AgentsListProps) {
  const logger = useComponentLogger('AgentsList', { logMount: false, logUnmount: false });
  const invalidateComponents = useProjectStore((s) => s.invalidateComponents);

  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Fetch all available agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agents`);
        if (res.ok) {
          const data = await res.json();
          setAllAgents(data.agents || []);
        }
      } catch (err) {
        logger.error('Failed to fetch agents', err);
      }
    };
    fetchAgents();
  }, []);

  const handleRemove = async (agentId: string) => {
    if (!confirm(`Remove agent "${agentId}"?`)) return;

    setRemoving(agentId);
    try {
      const res = await fetch(`${API_BASE}/api/remove-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, projectPath }),
      });
      if (res.ok) {
        onRefresh();
        invalidateComponents(); // Notify orchestrator to refresh
      }
    } catch (err) {
      logger.error('Failed to remove agent', err);
    } finally {
      setRemoving(null);
    }
  };

  const handleAdd = async () => {
    if (selectedToAdd.length === 0) return;

    setAdding(true);
    try {
      for (const agentId of selectedToAdd) {
        await fetch(`${API_BASE}/api/add-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, projectPath }),
        });
      }
      onRefresh();
      invalidateComponents(); // Notify orchestrator to refresh
      setShowAddModal(false);
      setSelectedToAdd([]);
    } catch (err) {
      logger.error('Failed to add agents', err);
    } finally {
      setAdding(false);
    }
  };

  const toggleAgentToAdd = (agentId: string) => {
    setSelectedToAdd((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  // Get agent details
  const getAgentDetails = (agentId: string) => {
    return allAgents.find((a) => a.id === agentId);
  };

  // Available agents to add
  const availableToAdd = allAgents.filter((a) => !installedAgents.includes(a.id));

  return (
    <div className="space-y-6">
      <PanelSection
        title="Installed Agents"
        description={`${installedAgents.length} agent(s) installed`}
        actions={
          <Button onClick={() => setShowAddModal(true)} size="sm">
            Add Agent
          </Button>
        }
      >
        <div className="space-y-3">
          {installedAgents.map((agentId) => {
            const agent = getAgentDetails(agentId);
            return (
              <Card key={agentId} padding="md">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {agent?.name || agentId}
                      </span>
                      {agent?.category && (
                        <Badge variant="primary">{agent.category}</Badge>
                      )}
                    </div>
                    {agent?.description && (
                      <p className="text-sm text-surface-400 mt-1">
                        {agent.description}
                      </p>
                    )}
                    {agent?.skills && agent.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(agent.skills || []).slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-300"
                          >
                            {skill}
                          </span>
                        ))}
                        {(agent.skills || []).length > 3 && (
                          <span className="text-xs text-surface-400">
                            +{(agent.skills || []).length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(agentId)}
                    loading={removing === agentId}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            );
          })}

          {installedAgents.length === 0 && (
            <div className="text-center py-8 text-surface-400">
              No agents installed. Click "Add Agent" to get started.
            </div>
          )}
        </div>
      </PanelSection>

      {/* Add Agent Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Agents"
        size="lg"
        footer={
          <ModalFooter
            onCancel={() => setShowAddModal(false)}
            onConfirm={handleAdd}
            confirmText={`Add ${selectedToAdd.length} Agent(s)`}
            loading={adding}
            disabled={selectedToAdd.length === 0}
          />
        }
      >
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {availableToAdd.map((agent) => (
            <Card
              key={agent.id}
              selectable
              selected={selectedToAdd.includes(agent.id)}
              onClick={() => toggleAgentToAdd(agent.id)}
              padding="sm"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedToAdd.includes(agent.id)}
                  onChange={() => toggleAgentToAdd(agent.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">
                      {agent.name}
                    </span>
                    <Badge variant="default" size="sm">
                      {agent.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-surface-400 mt-1">
                    {agent.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}

          {availableToAdd.length === 0 && (
            <div className="text-center py-8 text-surface-400">
              All available agents are already installed.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
