// SPDX-License-Identifier: MIT
import { useState, useEffect, useMemo } from 'react';
import type { Agent } from '@/types';
import { Modal, ModalFooter, Input, Checkbox, Card, Badge } from '../common';
import { useComponentLogger } from '@/hooks/useComponentLogger';

export interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (agentIds: string[]) => Promise<void>;
  installedAgents: string[];
}

export function AddAgentModal({
  isOpen,
  onClose,
  onAdd,
  installedAgents,
}: AddAgentModalProps) {
  const logger = useComponentLogger('AddAgentModal', { logMount: false, logUnmount: false });

  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Fetch agents
  useEffect(() => {
    if (isOpen) {
      const fetchAgents = async () => {
        try {
          const res = await fetch('/api/agents');
          if (res.ok) {
            const data = await res.json();
            setAllAgents(data.agents || []);
          }
        } catch (err) {
          logger.error('Failed to fetch agents', err);
        } finally {
          setFetching(false);
        }
      };
      fetchAgents();
    }
  }, [isOpen, logger]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state reset when modal closes
      setSelectedAgents([]);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Filter available agents
  const availableAgents = useMemo(() => {
    return allAgents
      .filter((agent) => !installedAgents.includes(agent.id))
      .filter(
        (agent) =>
          searchQuery === '' ||
          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [allAgents, installedAgents, searchQuery]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleAdd = async () => {
    if (selectedAgents.length === 0) return;
    setLoading(true);
    try {
      await onAdd(selectedAgents);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Agents"
      description={`Select agents to add to your project. ${selectedAgents.length} selected.`}
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleAdd}
          confirmText={`Add ${selectedAgents.length} Agent(s)`}
          loading={loading}
          disabled={selectedAgents.length === 0}
        />
      }
    >
      {/* Search */}
      <div className="mb-4">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agents..."
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

      {/* Agent List */}
      {fetching ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {availableAgents.map((agent) => {
            const isSelected = selectedAgents.includes(agent.id);
            return (
              <Card
                key={agent.id}
                selectable
                selected={isSelected}
                onClick={() => toggleAgent(agent.id)}
                padding="sm"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">
                        {agent.name}
                      </span>
                      <Badge variant="default" size="sm">
                        {agent.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-surface-400 mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}

          {availableAgents.length === 0 && (
            <div className="text-center py-8 text-surface-400">
              {allAgents.length === installedAgents.length
                ? 'All agents are already installed'
                : 'No agents match your search'}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
