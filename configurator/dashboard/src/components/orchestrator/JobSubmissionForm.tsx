// SPDX-License-Identifier: MIT
import { Button, Input, Badge } from '../common';
import type { SubTask } from './OrchestratorPanel';
import type { Agent } from '@/types';

export interface JobSubmissionFormProps {
  jobTitle: string;
  onJobTitleChange: (title: string) => void;
  jobContext: string;
  onJobContextChange: (context: string) => void;
  agentTasks: SubTask[];
  onEditTask: (index: number) => void;
  onRemoveTask: (index: number) => void;
  onAddTask: () => void;
  onTaskDescriptionChange: (index: number, description: string) => void;
  availableAgents: Agent[];
  agentStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed'>;
  isProcessing: boolean;
  mcpSuggestions: string[];
  onAnalyzeMcp: () => void;
  analyzingMcp: boolean;
}

export function JobSubmissionForm({
  jobTitle,
  onJobTitleChange,
  jobContext,
  onJobContextChange,
  agentTasks,
  onEditTask,
  onRemoveTask,
  onAddTask,
  onTaskDescriptionChange,
  availableAgents,
  agentStatuses,
  isProcessing,
  mcpSuggestions,
  onAnalyzeMcp,
  analyzingMcp,
}: JobSubmissionFormProps) {
  return (
    <div className="space-y-4">
      {/* Job Title */}
      <div>
        <label className="block text-sm text-surface-400 mb-2">Job Title</label>
        <Input
          value={jobTitle}
          onChange={(e) => onJobTitleChange(e.target.value)}
          placeholder="E.g., Add user authentication feature"
          fullWidth
        />
      </div>

      {/* Context */}
      <div>
        <label className="block text-sm text-surface-400 mb-2">Context (optional)</label>
        <textarea
          value={jobContext}
          onChange={(e) => onJobContextChange(e.target.value)}
          placeholder="Any additional context about the current state of the project..."
          rows={2}
          className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white text-sm placeholder:text-surface-500 focus:outline-none focus:border-primary-500 resize-y"
        />
      </div>

      {/* Agent Tasks Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium text-white">Agent Tasks</h3>
          <Button variant="secondary" size="sm" onClick={onAddTask}>
            + Add Agent Task
          </Button>
        </div>

        {agentTasks.length > 0 ? (
          <div className="space-y-2">
            {agentTasks.map((task, index) => {
              const agent = availableAgents.find((a) => a.id === task.agentId);
              const status = agentStatuses[task.agentId];
              return (
                <div
                  key={`task-${index}`}
                  className="flex items-start gap-3 p-3 bg-surface-800 border border-surface-700 rounded-lg"
                >
                  {/* Status indicator */}
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-full text-xs flex items-center justify-center ${
                      status === 'running'
                        ? 'bg-primary-500/20 text-primary-400'
                        : status === 'completed'
                        ? 'bg-green-500/20 text-green-400'
                        : status === 'failed'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-surface-700 text-surface-400'
                    }`}
                  >
                    {status === 'running' ? (
                      <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    ) : status === 'completed' ? (
                      '✓'
                    ) : status === 'failed' ? (
                      '✗'
                    ) : (
                      index + 1
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`font-medium text-sm ${
                          status === 'running'
                            ? 'text-primary-400'
                            : status === 'completed'
                            ? 'text-green-400'
                            : status === 'failed'
                            ? 'text-red-400'
                            : 'text-white'
                        }`}
                      >
                        {agent?.name || task.agentId}
                      </span>
                      {task.priority === 'high' && <Badge variant="warning" size="sm">High</Badge>}
                      {status === 'running' && (
                        <span className="text-xs text-primary-400">Working...</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={task.description}
                      onChange={(e) => onTaskDescriptionChange(index, e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-2 py-1 bg-surface-900 border border-surface-600 rounded text-white text-xs placeholder:text-surface-500 focus:outline-none focus:border-primary-500 transition-colors disabled:opacity-50"
                      placeholder="Task description..."
                    />
                  </div>

                  <button
                    onClick={() => onEditTask(index)}
                    className="text-surface-400 hover:text-primary-400 transition-colors"
                    disabled={isProcessing}
                    title="Edit all fields"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>

                  <button
                    onClick={() => onRemoveTask(index)}
                    className="text-surface-400 hover:text-red-400 transition-colors"
                    disabled={isProcessing}
                    title="Remove task"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 px-4 bg-surface-800 border border-dashed border-surface-600 rounded-lg text-surface-400 text-sm">
            No agent tasks added. Click "+ Add Agent Task" to start.
          </div>
        )}
      </div>

      {/* MCP Suggestions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium text-white">MCP Server Suggestions</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={onAnalyzeMcp}
            loading={analyzingMcp}
            disabled={agentTasks.length === 0}
          >
            Analyze Tasks
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {mcpSuggestions.length > 0 ? (
            mcpSuggestions.map((mcp, i) => <Badge key={`${mcp}-${i}`} variant="info">{mcp}</Badge>)
          ) : (
            <span className="text-sm text-surface-400 px-3 py-1 bg-surface-800 border border-dashed border-surface-600 rounded">
              Click "Analyze Tasks" to get suggestions
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
