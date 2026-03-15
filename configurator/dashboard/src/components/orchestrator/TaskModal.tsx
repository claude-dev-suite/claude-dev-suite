// SPDX-License-Identifier: MIT
/**
 * Task Modal Component
 *
 * Modal for adding/editing agent tasks in the orchestrator.
 */

import type React from 'react';
import { Button, Modal, Select, Input } from '../common';
import type { SubTask } from './OrchestratorPanel';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTaskIndex: number | null;
  newTaskAgent: string;
  setNewTaskAgent: (agent: string) => void;
  newTaskTitle: string;
  setNewTaskTitle: (title: string) => void;
  newTaskDescription: string;
  setNewTaskDescription: (description: string) => void;
  newTaskPriority: 'normal' | 'high';
  setNewTaskPriority: (priority: 'normal' | 'high') => void;
  newTaskDependsOn: number[];
  setNewTaskDependsOn: React.Dispatch<React.SetStateAction<number[]>>;
  onSubmit: () => void;
  isValid: boolean;
  availableAgents: { id: string; name: string; description?: string }[];
  installedAgents: string[];
  agentTasks: SubTask[];
}

export function TaskModal({
  isOpen,
  onClose,
  editingTaskIndex,
  newTaskAgent,
  setNewTaskAgent,
  newTaskTitle,
  setNewTaskTitle,
  newTaskDescription,
  setNewTaskDescription,
  newTaskPriority,
  setNewTaskPriority,
  newTaskDependsOn,
  setNewTaskDependsOn,
  onSubmit,
  isValid,
  availableAgents,
  installedAgents,
  agentTasks,
}: TaskModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingTaskIndex !== null ? 'Edit Agent Task' : 'Add Agent Task'}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-surface-400 mb-2">Select Agent</label>
          <Select
            options={availableAgents
              .filter((a) => installedAgents.includes(a.id))
              .map((a) => ({
                value: a.id,
                label: a.name,
                description: a.description,
              }))}
            value={newTaskAgent}
            onChange={(v) => setNewTaskAgent(v as string)}
            placeholder="Select an agent..."
            searchable
            fullWidth
          />
        </div>

        <div>
          <label className="block text-sm text-surface-400 mb-2">Task Title</label>
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="E.g., Setup database schema"
            fullWidth
          />
        </div>

        <div>
          <label className="block text-sm text-surface-400 mb-2">Task Description</label>
          <textarea
            value={newTaskDescription}
            onChange={(e) => setNewTaskDescription(e.target.value)}
            placeholder="Describe what this agent should do..."
            rows={3}
            className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white text-sm placeholder:text-surface-500 focus:outline-none focus:border-primary-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm text-surface-400 mb-2">Priority</label>
          <Select
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
            ]}
            value={newTaskPriority}
            onChange={(v) => setNewTaskPriority(v as 'normal' | 'high')}
            fullWidth
          />
        </div>

        {agentTasks.length > 0 && (
          <div>
            <label className="block text-sm text-surface-400 mb-2">Depends On (optional)</label>
            <div className="flex flex-wrap gap-2">
              {agentTasks.map((task, index) => (
                <label
                  key={`dep-${task.agentId}-${task.title}-${index}`}
                  className="flex items-center gap-2 text-sm text-surface-300"
                >
                  <input
                    type="checkbox"
                    checked={newTaskDependsOn.includes(index)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewTaskDependsOn((prev) => [...prev, index]);
                      } else {
                        setNewTaskDependsOn((prev) => prev.filter((i) => i !== index));
                      }
                    }}
                    className="rounded border-surface-600 bg-surface-800 text-primary-500"
                  />
                  Task {index + 1}: {task.title}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-surface-700">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={!isValid}>
          {editingTaskIndex !== null ? 'Save Changes' : 'Add Task'}
        </Button>
      </div>
    </Modal>
  );
}
