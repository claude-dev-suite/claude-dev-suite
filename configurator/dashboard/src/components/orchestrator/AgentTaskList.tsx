// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import type { Agent } from '@/types';
import { Button, Select, Input, Card } from '../common';
import type { SubTask } from './OrchestratorPanel';
import clsx from 'clsx';
import { API_BASE } from '../../utils/api';

export interface AgentTaskListProps {
  tasks: SubTask[];
  onAdd: (task: SubTask) => void;
  onRemove: (index: number) => void;
  onReorder: (tasks: SubTask[]) => void;
  onEdit: (index: number, task: SubTask) => void;
}

export function AgentTaskList({ tasks, onAdd, onRemove, onReorder, onEdit }: AgentTaskListProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAgentId, setNewAgentId] = useState('');
  const [newTask, setNewTask] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editAgentId, setEditAgentId] = useState('');
  const [editTask, setEditTask] = useState('');

  // Fetch available agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agents`);
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents || []);
        }
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      }
    };
    fetchAgents();
  }, []);

  const handleAdd = () => {
    if (!newAgentId || !newTask.trim()) return;
    onAdd({
      agentId: newAgentId,
      title: newTask.trim(),
      description: newTask.trim(),
      priority: 'normal',
      dependsOn: [],
    });
    setNewAgentId('');
    setNewTask('');
    setShowAddForm(false);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newTasks = [...tasks];
    const prev = newTasks[index - 1];
    const curr = newTasks[index];
    if (prev && curr) {
      [newTasks[index - 1], newTasks[index]] = [curr, prev];
    }
    onReorder(newTasks);
  };

  const handleMoveDown = (index: number) => {
    if (index === tasks.length - 1) return;
    const newTasks = [...tasks];
    const curr = newTasks[index];
    const next = newTasks[index + 1];
    if (curr && next) {
      [newTasks[index], newTasks[index + 1]] = [next, curr];
      onReorder(newTasks);
    }
  };

  const handleStartEdit = (index: number) => {
    const task = tasks[index];
    if (!task) return;
    setEditingIndex(index);
    setEditAgentId(task.agentId);
    setEditTask(task.description || task.title);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditAgentId('');
    setEditTask('');
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !editAgentId || !editTask.trim()) return;
    const originalTask = tasks[editingIndex];
    if (!originalTask) return;
    onEdit(editingIndex, {
      ...originalTask,
      agentId: editAgentId,
      title: editTask.trim(),
      description: editTask.trim(),
    });
    handleCancelEdit();
  };

  return (
    <div className="space-y-3">
      {/* Task List */}
      {tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((task, index) => {
            const agent = agents.find((a) => a.id === task.agentId);
            const isEditing = editingIndex === index;

            return (
              <Card key={`${task.agentId}-${task.title}-${index}`} padding="sm">
                {isEditing ? (
                  /* Edit Form */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded">
                        {index + 1}
                      </span>
                      <span className="text-xs text-surface-400">Editing task</span>
                    </div>
                    <Select
                      options={agents.map((a) => ({
                        value: a.id,
                        label: a.name,
                        description: a.category,
                      }))}
                      value={editAgentId}
                      onChange={(value) => setEditAgentId(value as string)}
                      placeholder="Select agent..."
                      searchable
                      fullWidth
                    />
                    <Input
                      value={editTask}
                      onChange={(e) => setEditTask(e.target.value)}
                      placeholder="Task description..."
                      fullWidth
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit} disabled={!editAgentId || !editTask.trim()}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <div className="flex items-start gap-2">
                    {/* Order Controls */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className={clsx(
                          'p-1 rounded text-surface-400 hover:text-white hover:bg-surface-700',
                          index === 0 && 'opacity-30 cursor-not-allowed'
                        )}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === tasks.length - 1}
                        className={clsx(
                          'p-1 rounded text-surface-400 hover:text-white hover:bg-surface-700',
                          index === tasks.length - 1 && 'opacity-30 cursor-not-allowed'
                        )}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Task Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-white">
                          {agent?.name || task.agentId}
                        </span>
                      </div>
                      <p className="text-xs text-surface-400 mt-1 line-clamp-2">{task.description}</p>
                    </div>

                    {/* Edit */}
                    <button
                      onClick={() => handleStartEdit(index)}
                      className="p-1 text-surface-400 hover:text-primary-400 transition-colors"
                      title="Edit task"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Remove */}
                    <button
                      onClick={() => onRemove(index)}
                      className="p-1 text-surface-400 hover:text-red-400 transition-colors"
                      title="Remove task"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-surface-400 text-sm">
          No tasks added yet
        </div>
      )}

      {/* Add Form */}
      {showAddForm ? (
        <div className="space-y-3 p-3 bg-surface-700/30 rounded-lg">
          <Select
            options={agents.map((a) => ({
              value: a.id,
              label: a.name,
              description: a.category,
            }))}
            value={newAgentId}
            onChange={(value) => setNewAgentId(value as string)}
            placeholder="Select agent..."
            searchable
            fullWidth
          />
          <Input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Task description..."
            fullWidth
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newAgentId || !newTask.trim()}>
              Add Task
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => setShowAddForm(true)}
        >
          Add Task
        </Button>
      )}
    </div>
  );
}
