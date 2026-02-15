// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback } from 'react';
import type { Job, QueueStatusPayload } from '@/types';
import { Console } from './Console';
import { ChatInput, type AutocompleteItem } from './ChatInput';
import { Button } from '../common';
import { API_BASE } from '@/utils/api';
import { useComponentLogger } from '@/hooks/useComponentLogger';
import { useOrchestratorWebSocket } from './hooks/useOrchestratorWebSocket';
import { useOrchestratorState } from './hooks/useOrchestratorState';
import { useOrchestratorData } from './hooks/useOrchestratorData';
import { useTaskModal } from './hooks/useTaskModal';
import { useSlashCommands } from './hooks/useSlashCommands';
import { OrchestratorHeader } from './OrchestratorHeader';
import { WorkflowSelector } from './WorkflowSelector';
import { JobSubmissionForm } from './JobSubmissionForm';
import { RecapPanel } from './RecapPanel';
import { InputPrompt, PermissionPrompt } from './PromptModal';
import { SessionPicker } from './SessionPicker';
import { JobQueuePanel } from './JobQueuePanel';
import { ConsoleHeader } from './ConsoleHeader';
import { TaskModal } from './TaskModal';
import { buildJobSummary, buildExecutionSummary, buildConsolidationTask } from './orchestrator-helpers';

export interface OrchestratorPanelProps {
  projectPath: string;
  pendingJob?: unknown;
  onJobSent?: () => void;
}

export interface SubTask {
  agentId: string;
  title: string;
  description: string;
  priority: 'normal' | 'high';
  dependsOn: number[];
}

export function OrchestratorPanel({ projectPath, pendingJob, onJobSent }: OrchestratorPanelProps) {
  const logger = useComponentLogger('OrchestratorPanel', { logMount: false, logUnmount: false });

  // Use custom hooks for data and state
  const data = useOrchestratorData(projectPath);
  const state = useOrchestratorState();
  const taskModal = useTaskModal();

  // Additional local state
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatusPayload | null>(null);
  const [analyzingMcp, setAnalyzingMcp] = useState(false);

  // WebSocket hook with callbacks
  const ws = useOrchestratorWebSocket({
    projectPath,
    onJobStarted: (job) => {
      state.setCurrentJob(job);
      state.setIsProcessing(true);
      state.setAgentStatuses({});
    },
    onJobComplete: (sessionId, recap) => {
      state.setIsProcessing(false);
      state.setProgressStatus('Job completed successfully');
      if (state.currentJob) state.setCurrentJob({ ...state.currentJob, status: 'completed' });
      state.setCurrentAgent('');

      if (sessionId) {
        state.setChatSessionId(sessionId);
        localStorage.setItem('orchestrator_session_id', sessionId);
      }

      if (recap) {
        state.setRecapData({ success: true, ...recap });
        state.setShowRecap(true);
      }
    },
    onJobError: (error) => {
      state.setIsProcessing(false);
      state.setProgressStatus(`Error: ${error}`);
      state.addOutput(`\x1b[31m✗ Error: ${error}\x1b[0m`);
      if (state.currentJob) state.setCurrentJob({ ...state.currentJob, status: 'failed' });
    },
    onJobCancelled: () => {
      state.setIsProcessing(false);
      state.setProgressStatus('Interrupted');
      state.addOutput('\x1b[33m⎿ Interrupted · What should Claude do instead?\x1b[0m');
      if (state.currentJob) state.setCurrentJob({ ...state.currentJob, status: 'cancelled' });
    },
    onAgentStarted: (agentId) => {
      state.setCurrentAgent(agentId);
      state.updateAgentStatus(agentId, 'running');
      state.addOutput(`\x1b[34m▶ Agent @${agentId} started\x1b[0m`);
    },
    onAgentCompleted: (agentId, success) => {
      state.updateAgentStatus(agentId, success ? 'completed' : 'failed');
      const icon = success ? '✓' : '✗';
      const color = success ? '\x1b[32m' : '\x1b[31m';
      state.addOutput(`${color}${icon} Agent @${agentId} ${success ? 'completed' : 'failed'}\x1b[0m`);
      state.setCurrentAgent('');
    },
    onOutput: (text, isReasoning) => {
      if (isReasoning) {
        state.addOutput(`\x1b[36m\x1b[3m${text}\x1b[0m`);
      } else {
        state.addOutput(text);
      }
    },
    onInputRequired: (prompt, jobId) => {
      state.setInputRequest({ prompt, jobId });
    },
    onPermissionRequired: (type, target, jobId) => {
      state.setPermissionRequest({ type, target, jobId });
    },
    onChatSession: (sessionId) => {
      state.setChatSessionId(sessionId);
      localStorage.setItem('orchestrator_session_id', sessionId);
      logger.debug('Session ID saved', { sessionId });
    },
    onHistoryCleared: () => {
      state.clearOutput();
      state.addOutput('\x1b[34mℹ Chat history cleared\x1b[0m');
      state.setChatSessionId(null);
      localStorage.removeItem('orchestrator_session_id');
    },
    onProgress: (percent, status) => {
      if (status) state.setProgressStatus(status);
      if (percent !== undefined) state.setProgressStatus(`Progress: ${percent}%`);
    },
    onToolUse: (toolName, toolInput) => {
      state.addOutput(`\x1b[33m⚡ ${toolName}\x1b[0m`);
      if (toolInput) {
        state.addOutput(
          `\x1b[90m   ${toolInput.substring(0, 100)}${toolInput.length > 100 ? '...' : ''}\x1b[0m`
        );
      }
    },
    onWarning: (message) => {
      state.addOutput(`\x1b[33m⚠ ${message}\x1b[0m`);
    },
    onError: (message) => {
      state.setIsProcessing(false);
      state.setProgressStatus('Error');
      state.addOutput(`\x1b[31m✗ ${message}\x1b[0m`);
    },
    onBatchComplete: (summary) => {
      state.addOutput(
        `\x1b[32m✓ Batch complete: ${summary.successCount}/${summary.totalJobs} succeeded\x1b[0m`
      );
    },
    onQueueStatus: (status) => {
      setQueueStatus(status);
      logger.debug('Queue status updated', status);
    },
    onQueueCleared: () => {
      setQueueStatus((prev) => prev ? { ...prev, queuedJobs: [], queueLength: 0 } : null);
    },
    onJobRemoved: (jobId) => {
      setQueueStatus((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          queuedJobs: prev.queuedJobs.filter((j) => j.id !== jobId),
          queueLength: prev.queueLength - 1,
        };
      });
    },
    onQueueUnstuck: () => {
      setQueueStatus((prev) => prev ? { ...prev, currentJob: null } : null);
      state.setIsProcessing(false);
      state.setProgressStatus('Queue unstuck - ready');
    },
  });

  // Slash commands hook
  const { handleSlashCommand } = useSlashCommands({
    installedAgents: data.installedAgents,
    installedMcpServers: data.installedMcpServers,
    projectCommands: data.projectCommands,
    addOutput: state.addOutput,
    clearOutput: state.clearOutput,
    setCurrentJob: state.setCurrentJob,
    setProgressStatus: state.setProgressStatus,
    setCurrentAgent: state.setCurrentAgent,
    setChatSessionId: state.setChatSessionId,
    wsConnected: ws.connected,
    wsNewChat: ws.newChat,
    wsClearJobContext: ws.clearJobContext,
    setShowSessionPicker,
  });

  // ESC key handler for fullscreen
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isFullscreen) {
        state.setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [state.isFullscreen, state]);

  // Handle pending job from code review
  useEffect(() => {
    if (pendingJob && ws.connected) {
      const rawJob = pendingJob as Record<string, unknown>;
      const pendingData = (rawJob.data as Record<string, unknown>) || rawJob;

      const jobId = `review-${Date.now()}`;
      const jobTitle = (pendingData.title as string) || 'Code Review';
      const jobContext = (pendingData.context as string) || '';
      const jobSubTasks = (pendingData.subTasks as Array<{ agentId: string; task: string }>) || [];
      const jobProjectPath = (pendingData.projectPath as string) || projectPath;

      logger.info('Processing pending job', {
        jobTitle,
        contextLength: jobContext.length,
        subTasksCount: jobSubTasks.length,
        jobProjectPath,
      });

      const job: Job = {
        id: jobId,
        title: jobTitle,
        prompt: jobContext,
        status: 'pending',
        createdAt: new Date().toISOString(),
        projectPath: jobProjectPath,
        subTasks: jobSubTasks.map((t) => ({ agentId: t.agentId, task: t.task })),
      };

      const initialOutput = buildJobSummary(jobTitle, jobProjectPath, jobSubTasks);
      state.setOutput(initialOutput);
      state.setCurrentJob(job);
      state.setIsProcessing(true);
      state.setProgressStatus(`Starting: ${jobTitle}`);

      ws.submitJob(job, jobContext, jobSubTasks);
      onJobSent?.();
    }
  }, [pendingJob, ws.connected, projectPath, ws, state, onJobSent, logger]);

  // Submit job handler
  const submitJob = useCallback(() => {
    if (!ws.connected) return;
    if (state.agentTasks.length === 0 && !state.jobTitle.trim()) {
      alert('Please add at least one agent task or enter a job title');
      return;
    }

    let promptText = state.jobContext || state.jobTitle;
    if (!promptText && state.agentTasks.length > 0) {
      promptText = state.agentTasks
        .map((t) => `@${t.agentId}: ${t.description}`)
        .join('\n\n');
    }

    const job: Partial<Job> = {
      id: crypto.randomUUID(),
      title: state.jobTitle || 'Custom Task',
      prompt: promptText,
      projectPath,
      status: 'pending',
      createdAt: new Date().toISOString(),
      subTasks: state.agentTasks.map((t) => ({ agentId: t.agentId, task: t.description })),
    };

    const summaryOutput = buildExecutionSummary(
      job,
      projectPath,
      state,
      data.workflows,
      data.availableAgents
    );

    const subTasks: Array<{ agentId: string; task: string; dependencies?: string[] }> = state.agentTasks.map((t) => ({ agentId: t.agentId, task: t.description }));

    // Add consolidation if multiple agents
    if (subTasks.length > 1) {
      const agentNames = subTasks
        .map((t) => {
          const agent = data.availableAgents.find((a) => a.id === t.agentId);
          return agent?.name || t.agentId;
        })
        .join(', ');

      const agentIds = subTasks.map((t) => t.agentId);
      subTasks.push({
        agentId: 'consolidator',
        task: buildConsolidationTask(subTasks.length, agentNames),
        dependencies: agentIds,
      });

      summaryOutput.splice(
        -2,
        0,
        '\x1b[33m📊 Consolidation:\x1b[0m A final summary will be generated after all agents complete'
      );
      summaryOutput.splice(-2, 0, '');
    }

    state.setOutput(summaryOutput);
    state.setCurrentJob(job as Job);
    state.setIsProcessing(true);
    state.setProgressStatus('Submitting job...');

    state.clearAgentTasks();
    state.setJobTitle('');
    state.setJobContext('');
    state.setSelectedWorkflow('');
    state.setMcpSuggestions([]);

    ws.submitJob(job as Job, state.jobContext, subTasks);
  }, [ws, state, projectPath, data.workflows, data.availableAgents]);

  // Send chat message
  const sendChatMessage = useCallback(
    (message: string) => {
      if (!ws.connected || !message.trim()) return;

      state.addOutput(`\x1b[92m❯ ${message}\x1b[0m`);
      state.setIsProcessing(true);
      state.setProgressStatus('Processing...');

      if (ws.lastJobContext && !state.chatSessionId) {
        logger.debug('Using job context for chat continuity (first message)', {
          jobId: ws.lastJobContext.jobId,
          findingsLength: ws.lastJobContext.findings.length,
        });
        ws.sendChatMessage(message, null, false, ws.lastJobContext);
        ws.clearJobContext();
      } else if (state.chatSessionId) {
        ws.sendChatMessage(message, state.chatSessionId, true);
      } else {
        ws.sendChatMessage(message);
      }
    },
    [ws, state, logger]
  );

  // Handle session resume
  const handleSessionResume = useCallback(
    async (sessionId: string) => {
      setShowSessionPicker(false);
      state.clearOutput();
      state.addOutput(`\x1b[32m✓ Resuming session: ${sessionId.substring(0, 8)}...\x1b[0m\n`);

      try {
        const response = await fetch(
          `${API_BASE}/api/orchestrator/sessions/${sessionId}/history?project_path=${encodeURIComponent(projectPath)}`
        );
        const responseData = await response.json();

        if (responseData.success && responseData.messages) {
          state.addOutput(`\x1b[90m━━━ Previous conversation (${responseData.messages.length} messages) ━━━\x1b[0m\n`);

          for (const msg of responseData.messages) {
            if (msg.role === 'user') {
              state.addOutput(`\x1b[92m❯ ${msg.content}\x1b[0m\n`);
            } else if (msg.role === 'assistant') {
              const content = msg.content.length > 500
                ? msg.content.substring(0, 500) + '...[truncated]'
                : msg.content;
              state.addOutput(`\x1b[36m${content}\x1b[0m\n`);
            }
          }

          state.addOutput(`\x1b[90m━━━ End of previous conversation ━━━\x1b[0m\n`);
        }
      } catch {
        state.addOutput(`\x1b[33m⚠ Could not load session history\x1b[0m\n`);
      }

      state.setChatSessionId(sessionId);
      localStorage.setItem('orchestrator_session_id', sessionId);
      state.addOutput(`\x1b[90mType your message to continue the conversation...\x1b[0m\n`);
    },
    [state, projectPath]
  );

  // Handle workflow change
  const handleWorkflowChange = useCallback(
    (workflowValue: string) => {
      state.setSelectedWorkflow(workflowValue);

      if (!workflowValue) {
        state.clearAgentTasks();
        state.setMcpSuggestions([]);
        return;
      }

      const [type, id] = workflowValue.split(':');
      const workflowList = type === 'builtin' ? data.workflows.builtin : data.workflows.custom;
      const workflow = workflowList.find((w) => w.id === id);

      if (workflow) {
        const tasks: SubTask[] = (workflow.subTasks || []).map((st) => ({
          agentId: st.agentId,
          title: st.title || st.agentId,
          description: st.taskTemplate || st.task || '',
          priority: st.priority || 'normal',
          dependsOn: st.dependencies || [],
        }));
        state.setAgentTasks(tasks);
        state.setMcpSuggestions(workflow.mcpServers || []);
      }
    },
    [data.workflows, state]
  );

  // Analyze MCP suggestions
  const analyzeForMcpSuggestions = useCallback(async () => {
    if (state.agentTasks.length === 0) return;

    setAnalyzingMcp(true);
    try {
      const res = await fetch(`${API_BASE}/api/orchestrator/analyze-mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: state.agentTasks.map((t) => t.description),
          projectPath,
        }),
      });

      if (res.ok) {
        const responseData = await res.json();
        state.setMcpSuggestions(responseData.suggestions || []);
      }
    } catch (err) {
      if (err instanceof Error) {
        logger.error('Failed to analyze MCP suggestions', err);
      }
    } finally {
      setAnalyzingMcp(false);
    }
  }, [state, projectPath, logger]);

  // Add/update agent task
  const handleAddOrUpdateTask = useCallback(() => {
    if (!taskModal.isValid()) return;

    const taskData = taskModal.getTaskData();
    if (taskModal.editingTaskIndex !== null) {
      state.updateAgentTask(taskModal.editingTaskIndex, taskData);
    } else {
      state.addAgentTask(taskData);
    }
    taskModal.closeModal();
  }, [taskModal, state]);

  // Start editing task
  const startEditTask = useCallback(
    (index: number) => {
      const task = state.agentTasks[index];
      if (task) {
        taskModal.openEditModal(index, task);
      }
    },
    [state.agentTasks, taskModal]
  );

  // Action handlers
  const sendUserInput = useCallback(
    (response?: string) => {
      if (!ws.connected) return;
      const text = response ?? state.userInput;
      ws.sendUserInput(text, state.inputRequest?.jobId || '');
      state.addOutput(`\x1b[92m❯ ${text}\x1b[0m`);
      state.setInputRequest(null);
      state.setUserInput('');
    },
    [ws, state]
  );

  const sendPermissionResponse = useCallback(
    (response: 'y' | 'a' | 'n') => {
      if (!ws.connected) return;
      ws.sendPermissionResponse(response, state.permissionRequest?.jobId || '');
      const responseText =
        response === 'y' ? 'Allowed once' : response === 'a' ? 'Allowed always' : 'Denied';
      const color = response === 'n' ? '\x1b[31m' : '\x1b[32m';
      state.addOutput(`${color}🔐 Permission: ${responseText}\x1b[0m`);
      state.setPermissionRequest(null);
    },
    [ws, state]
  );

  const cancelJob = useCallback(() => {
    if (!ws.connected) return;

    if (state.currentJob) {
      ws.cancelJob(state.currentJob.id);
    } else if (state.isProcessing) {
      ws.cancelChat();
    }

    state.setIsProcessing(false);
    state.setProgressStatus('Cancelled');
    state.addOutput('\x1b[33m⎿ Operation cancelled\x1b[0m');
  }, [ws, state]);

  const startNewChat = useCallback(() => {
    if (!ws.connected) return;

    state.clearOutput();
    state.setCurrentJob(null);
    state.setProgressStatus('Ready - Configure agents and click Execute Job');
    state.setCurrentAgent('');
    state.setChatSessionId(null);
    localStorage.removeItem('orchestrator_session_id');

    ws.newChat();
    ws.clearJobContext();
  }, [ws, state]);

  // Agent autocomplete items
  const agentAutocompleteItems: AutocompleteItem[] = data.installedAgents.map((a) => ({
    name: `@${a}`,
    description: 'Specialized agent',
    icon: '🧠',
  }));

  const canExecute = ws.connected && (state.agentTasks.length > 0 || state.jobTitle.trim());

  return (
    <div className="h-full overflow-y-auto">
      <OrchestratorHeader connected={ws.connected} wsStatusText={ws.wsStatusText} />

      <JobQueuePanel
        connected={ws.connected}
        queueStatus={queueStatus}
        onGetQueueStatus={ws.getQueueStatus}
        onClearQueue={ws.clearQueue}
        onRemoveFromQueue={ws.removeFromQueue}
        onForceUnstick={ws.forceUnstick}
      />

      <WorkflowSelector
        workflows={data.workflows}
        selectedWorkflow={state.selectedWorkflow}
        onWorkflowChange={handleWorkflowChange}
      />

      <div data-tutorial="job-submission">
      <JobSubmissionForm
        jobTitle={state.jobTitle}
        onJobTitleChange={state.setJobTitle}
        jobContext={state.jobContext}
        onJobContextChange={state.setJobContext}
        agentTasks={state.agentTasks}
        onEditTask={startEditTask}
        onRemoveTask={state.removeAgentTask}
        onAddTask={taskModal.openAddModal}
        onTaskDescriptionChange={(index, description) => {
          state.setAgentTasks((prev) =>
            prev.map((t, i) => (i === index ? { ...t, description, title: description } : t))
          );
        }}
        availableAgents={data.availableAgents}
        agentStatuses={state.agentStatuses}
        isProcessing={state.isProcessing}
        mcpSuggestions={state.mcpSuggestions}
        onAnalyzeMcp={analyzeForMcpSuggestions}
        analyzingMcp={analyzingMcp}
      />

      <div className="flex gap-2 mb-4">
        <Button variant="secondary" onClick={state.resetAll}>
          Reset
        </Button>
        <Button onClick={submitJob} disabled={!canExecute || state.isProcessing}>
          Execute Job
        </Button>
      </div>
      </div>

      <div className="bg-surface-800 border border-surface-700 rounded-lg p-4" data-tutorial="console-area">
        <div className="flex items-center gap-3 mb-4">
          {state.isProcessing && (
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          )}
          <span className="text-sm text-surface-300">{state.progressStatus}</span>
        </div>

        <div className={state.isFullscreen ? 'fixed inset-0 z-50 p-4 bg-surface-900 flex flex-col' : ''}>
          <div
            className={`bg-[#1a1a2e] border border-[#2d2d44] rounded-lg overflow-hidden transition-all duration-300 ${
              state.isFullscreen ? 'flex-1 flex flex-col' : ''
            }`}
          >
            <ConsoleHeader
              consoleSize={state.consoleSize}
              setConsoleSize={state.setConsoleSize}
              currentAgent={state.currentAgent}
              isFullscreen={state.isFullscreen}
              setIsFullscreen={state.setIsFullscreen}
            />

            <Console
              output={state.output}
              size={state.isFullscreen ? 'full' : state.consoleSize}
              minimal
              className={state.isFullscreen ? 'flex-1' : ''}
            />

            <ChatInput
              onSend={sendChatMessage}
              onSlashCommand={handleSlashCommand}
              onCancel={cancelJob}
              onNewChat={startNewChat}
              disabled={!ws.connected}
              processing={state.isProcessing}
              agents={agentAutocompleteItems}
              projectCommands={data.projectCommands}
            />
          </div>
        </div>

        {state.inputRequest && (
          <InputPrompt
            inputRequest={state.inputRequest}
            userInput={state.userInput}
            onUserInputChange={state.setUserInput}
            onSendInput={sendUserInput}
          />
        )}

        {state.permissionRequest && (
          <PermissionPrompt
            permissionRequest={state.permissionRequest}
            onPermissionResponse={sendPermissionResponse}
          />
        )}

        {state.showRecap && state.recapData && (
          <RecapPanel
            recapData={state.recapData}
            jobTitle={state.jobTitle}
            onCopySummary={() => {
              const summary = `Job: ${state.jobTitle}\n\nResult: ${
                state.recapData?.success ? 'Success' : 'Failed'
              }\n\n${state.recapData?.summary || ''}`;
              navigator.clipboard.writeText(summary);
            }}
            onNewJob={state.resetAll}
          />
        )}

        <div className="flex gap-2 mt-4">
          <Button variant="secondary" onClick={cancelJob} disabled={!state.isProcessing}>
            Cancel Job
          </Button>
          <Button variant="secondary" onClick={state.clearOutput}>
            Clear Output
          </Button>
        </div>
      </div>

      <TaskModal
        isOpen={taskModal.showAddTaskModal}
        onClose={taskModal.closeModal}
        editingTaskIndex={taskModal.editingTaskIndex}
        newTaskAgent={taskModal.newTaskAgent}
        setNewTaskAgent={taskModal.setNewTaskAgent}
        newTaskTitle={taskModal.newTaskTitle}
        setNewTaskTitle={taskModal.setNewTaskTitle}
        newTaskDescription={taskModal.newTaskDescription}
        setNewTaskDescription={taskModal.setNewTaskDescription}
        newTaskPriority={taskModal.newTaskPriority}
        setNewTaskPriority={taskModal.setNewTaskPriority}
        newTaskDependsOn={taskModal.newTaskDependsOn}
        setNewTaskDependsOn={taskModal.setNewTaskDependsOn}
        onSubmit={handleAddOrUpdateTask}
        isValid={taskModal.isValid()}
        availableAgents={data.availableAgents}
        installedAgents={data.installedAgents}
        agentTasks={state.agentTasks}
      />

      <SessionPicker
        isOpen={showSessionPicker}
        onClose={() => setShowSessionPicker(false)}
        onSelect={handleSessionResume}
        currentSessionId={state.chatSessionId}
      />
    </div>
  );
}
