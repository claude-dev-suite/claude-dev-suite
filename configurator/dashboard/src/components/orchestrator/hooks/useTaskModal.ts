// SPDX-License-Identifier: MIT
/**
 * Hook for managing the Add/Edit Task modal state
 */

import { useState, useCallback } from 'react';
import type { SubTask } from '../OrchestratorPanel';

export interface TaskModalState {
  showAddTaskModal: boolean;
  newTaskAgent: string;
  newTaskTitle: string;
  newTaskDescription: string;
  newTaskPriority: 'normal' | 'high';
  newTaskDependsOn: number[];
  editingTaskIndex: number | null;
}

export interface TaskModalActions {
  openAddModal: () => void;
  openEditModal: (index: number, task: SubTask) => void;
  closeModal: () => void;
  setNewTaskAgent: (agent: string) => void;
  setNewTaskTitle: (title: string) => void;
  setNewTaskDescription: (description: string) => void;
  setNewTaskPriority: (priority: 'normal' | 'high') => void;
  setNewTaskDependsOn: React.Dispatch<React.SetStateAction<number[]>>;
  getTaskData: () => SubTask;
  isValid: () => boolean;
}

export function useTaskModal(): TaskModalState & TaskModalActions {
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskAgent, setNewTaskAgent] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'normal' | 'high'>('normal');
  const [newTaskDependsOn, setNewTaskDependsOn] = useState<number[]>([]);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);

  const resetFields = useCallback(() => {
    setNewTaskAgent('');
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('normal');
    setNewTaskDependsOn([]);
    setEditingTaskIndex(null);
  }, []);

  const openAddModal = useCallback(() => {
    resetFields();
    setShowAddTaskModal(true);
  }, [resetFields]);

  const openEditModal = useCallback((index: number, task: SubTask) => {
    setNewTaskAgent(task.agentId);
    setNewTaskTitle(task.title);
    setNewTaskDescription(task.description);
    setNewTaskPriority(task.priority);
    setNewTaskDependsOn(task.dependsOn);
    setEditingTaskIndex(index);
    setShowAddTaskModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowAddTaskModal(false);
    setEditingTaskIndex(null);
  }, []);

  const getTaskData = useCallback((): SubTask => ({
    agentId: newTaskAgent,
    title: newTaskTitle,
    description: newTaskDescription || newTaskTitle,
    priority: newTaskPriority,
    dependsOn: newTaskDependsOn,
  }), [newTaskAgent, newTaskTitle, newTaskDescription, newTaskPriority, newTaskDependsOn]);

  const isValid = useCallback(() => {
    return Boolean(newTaskAgent && newTaskTitle.trim());
  }, [newTaskAgent, newTaskTitle]);

  return {
    // State
    showAddTaskModal,
    newTaskAgent,
    newTaskTitle,
    newTaskDescription,
    newTaskPriority,
    newTaskDependsOn,
    editingTaskIndex,
    // Actions
    openAddModal,
    openEditModal,
    closeModal,
    setNewTaskAgent,
    setNewTaskTitle,
    setNewTaskDescription,
    setNewTaskPriority,
    setNewTaskDependsOn,
    getTaskData,
    isValid,
  };
}
