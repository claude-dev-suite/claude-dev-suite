// SPDX-License-Identifier: MIT
/**
 * Custom Agents Panel
 *
 * Displays and manages project-specific custom agents with create/edit/delete functionality.
 */

import { useState } from 'react';
import { Button, Card, Badge, ErrorMessage, Spinner } from '../common';
import { PanelSection } from '../layout';
import { useCustomAgents } from '@/hooks/useCustomAgents';
import { useComponentLogger } from '@/hooks/useComponentLogger';
import { CustomAgentModal } from './CustomAgentModal';
import { CustomAgentEditorModal } from './CustomAgentEditorModal';
import type { CustomAgentListItem, CustomAgent } from '@/types/custom-agents';

export interface CustomAgentsPanelProps {
  projectPath: string;
}

export function CustomAgentsPanel({ projectPath }: CustomAgentsPanelProps) {
  useComponentLogger('CustomAgentsPanel', { logMount: false });

  const {
    agents,
    loading,
    error,
    refetch,
    getAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    validateContent,
    uploadAgent,
    skills,
  } = useCustomAgents(projectPath);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<CustomAgent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Handle opening editor for existing agent
  const handleEdit = async (agentItem: CustomAgentListItem) => {
    const agent = await getAgent(agentItem.id);
    if (agent) {
      setSelectedAgent(agent);
      setShowEditorModal(true);
    }
  };

  // Handle delete confirmation
  const handleDelete = async (agentId: string) => {
    if (!confirm(`Delete custom agent "${agentId}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(agentId);
    try {
      const result = await deleteAgent(agentId);
      if (!result.success) {
        alert(result.error || 'Failed to delete agent');
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Handle save from editor
  const handleSave = async (content: string, bypassWarnings: boolean) => {
    if (selectedAgent) {
      return await updateAgent(selectedAgent.id, content, bypassWarnings);
    }
    return { success: false, error: 'No agent selected' };
  };

  // Model badge colors
  const getModelBadgeClass = (model: string) => {
    switch (model) {
      case 'opus':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'haiku':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorMessage error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PanelSection
        title="Custom Agents"
        description="Project-specific agents with custom behavior and expertise"
        actions={
          <Button onClick={() => setShowCreateModal(true)} size="sm">
            Create Agent
          </Button>
        }
      >
        {agents.length === 0 ? (
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-surface-300 mb-2">
              No Custom Agents
            </h3>
            <p className="text-sm text-surface-400 mb-4">
              Create custom agents tailored to your project's specific needs.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              Create Your First Agent
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <Card key={agent.id} padding="md" className="hover:border-surface-600 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">
                        {agent.name}
                      </span>
                      <Badge variant="warning" size="sm">
                        Custom
                      </Badge>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${getModelBadgeClass(agent.model)}`}
                      >
                        {agent.model}
                      </span>
                    </div>
                    <p className="text-sm text-surface-400 mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                      <span>{agent.skillCount} skill{agent.skillCount !== 1 ? 's' : ''}</span>
                      <span>{agent.mcpServerCount} MCP server{agent.mcpServerCount !== 1 ? 's' : ''}</span>
                      {agent.modifiedAt && (
                        <span>
                          Modified {new Date(agent.modifiedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(agent)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(agent.id)}
                      loading={deletingId === agent.id}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PanelSection>

      {/* Create Modal */}
      <CustomAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectPath={projectPath}
        onCreateAgent={createAgent}
        onUploadAgent={uploadAgent}
        onValidate={validateContent}
        availableSkills={skills}
      />

      {/* Editor Modal */}
      {selectedAgent && (
        <CustomAgentEditorModal
          isOpen={showEditorModal}
          onClose={() => {
            setShowEditorModal(false);
            setSelectedAgent(null);
          }}
          agent={selectedAgent}
          onSave={handleSave}
          onValidate={validateContent}
        />
      )}
    </div>
  );
}
