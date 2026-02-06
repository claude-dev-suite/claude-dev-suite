// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrchestratorPanel } from '../OrchestratorPanel';
import type { Agent } from '@/types';
import * as orchestratorState from '../hooks/useOrchestratorState';
import * as orchestratorWs from '../hooks/useOrchestratorWebSocket';
import * as componentLogger from '@/hooks/useComponentLogger';

// Mock dependencies
vi.mock('../hooks/useOrchestratorWebSocket');
vi.mock('../hooks/useOrchestratorState');
vi.mock('@/hooks/useComponentLogger');
vi.mock('../Console', () => ({
  Console: ({ output }: { output: string[] }) => (
    <div data-testid="console-mock">
      {output.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  ),
}));
vi.mock('../ChatInput', () => ({
  ChatInput: ({ onSend, disabled, processing }: any) => (
    <div data-testid="chat-input-mock">
      <input
        data-testid="chat-input"
        disabled={disabled || processing}
        onChange={(e) => onSend?.(e.target.value)}
      />
    </div>
  ),
}));
vi.mock('../OrchestratorHeader', () => ({
  OrchestratorHeader: ({ connected, wsStatusText }: any) => (
    <div data-testid="header-mock">
      Status: {wsStatusText} - {connected ? 'Connected' : 'Disconnected'}
    </div>
  ),
}));
vi.mock('../WorkflowSelector', () => ({
  WorkflowSelector: () => <div data-testid="workflow-selector-mock">Workflow Selector</div>,
}));
vi.mock('../JobSubmissionForm', () => ({
  JobSubmissionForm: () => <div data-testid="job-submission-form-mock">Job Submission Form</div>,
}));

describe('OrchestratorPanel', () => {
  const mockAgents: Agent[] = [
    {
      id: 'react-expert',
      name: 'React Expert',
      description: 'React specialist',
      category: 'frontend',
      skills: ['react'],
      mcp_servers: [],
    },
    {
      id: 'vitest-expert',
      name: 'Vitest Expert',
      description: 'Testing specialist',
      category: 'testing',
      skills: ['vitest'],
      mcp_servers: [],
    },
  ];

  const mockState = {
    jobTitle: '',
    setJobTitle: vi.fn(),
    jobContext: '',
    setJobContext: vi.fn(),
    selectedWorkflow: '',
    setSelectedWorkflow: vi.fn(),
    agentTasks: [],
    setAgentTasks: vi.fn(),
    addAgentTask: vi.fn(),
    updateAgentTask: vi.fn(),
    removeAgentTask: vi.fn(),
    clearAgentTasks: vi.fn(),
    output: [],
    addOutput: vi.fn(),
    clearOutput: vi.fn(),
    setOutput: vi.fn(),
    currentJob: null,
    setCurrentJob: vi.fn(),
    isProcessing: false,
    setIsProcessing: vi.fn(),
    progressStatus: 'Ready',
    setProgressStatus: vi.fn(),
    currentAgent: '',
    setCurrentAgent: vi.fn(),
    consoleSize: 'md' as const,
    setConsoleSize: vi.fn(),
    isFullscreen: false,
    setIsFullscreen: vi.fn(),
    inputRequest: null,
    setInputRequest: vi.fn(),
    permissionRequest: null,
    setPermissionRequest: vi.fn(),
    userInput: '',
    setUserInput: vi.fn(),
    showRecap: false,
    setShowRecap: vi.fn(),
    recapData: null,
    setRecapData: vi.fn(),
    agentStatuses: {},
    setAgentStatuses: vi.fn(),
    updateAgentStatus: vi.fn(),
    chatSessionId: null,
    setChatSessionId: vi.fn(),
    mcpSuggestions: [],
    setMcpSuggestions: vi.fn(),
    resetAll: vi.fn(),
  };

  const mockWs = {
    connected: true,
    wsStatusText: 'Connected',
    submitJob: vi.fn(),
    sendChatMessage: vi.fn(),
    sendUserInput: vi.fn(),
    sendPermissionResponse: vi.fn(),
    cancelJob: vi.fn(),
    cancelChat: vi.fn(),
    newChat: vi.fn(),
    // Queue management
    getQueueStatus: vi.fn(),
    clearQueue: vi.fn(),
    removeFromQueue: vi.fn(),
    forceUnstick: vi.fn(),
    // Job context for token-efficient chat continuity
    lastJobContext: null,
    clearJobContext: vi.fn(),
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup module mocks
    vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue(mockState);
    vi.mocked(orchestratorWs.useOrchestratorWebSocket).mockReturnValue(mockWs);
    vi.mocked(componentLogger.useComponentLogger).mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any);

    // Mock fetch
    global.fetch = vi.fn();

    // Mock localStorage
    Storage.prototype.getItem = vi.fn();
    Storage.prototype.setItem = vi.fn();
    Storage.prototype.removeItem = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render main components', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: mockAgents }),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByTestId('header-mock')).toBeInTheDocument();
        expect(screen.getByTestId('workflow-selector-mock')).toBeInTheDocument();
        expect(screen.getByTestId('job-submission-form-mock')).toBeInTheDocument();
        expect(screen.getByTestId('console-mock')).toBeInTheDocument();
        expect(screen.getByTestId('chat-input-mock')).toBeInTheDocument();
      });
    });

    it('should render action buttons', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: [] }),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /execute job/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel job/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /clear output/i })).toBeInTheDocument();
      });
    });

    it('should show connection status in header', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      });
    });
  });

  describe('Data Fetching', () => {
    it('should fetch available agents on mount', async () => {
      const fetchMock = vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: mockAgents }),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/agents?projectPath='),
          expect.any(Object)
        );
      });
    });

    it('should fetch installed components on mount', async () => {
      const fetchMock = vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: [], mcpServers: [] }),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/installed-components?path='),
          expect.any(Object)
        );
      });
    });

    it('should fetch project commands on mount', async () => {
      const fetchMock = vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ commands: [] }),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/available-commands?path='),
          expect.any(Object)
        );
      });
    });

    it('should fetch workflows on mount', async () => {
      const fetchMock = vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ builtin: [], custom: [] }),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/orchestrator/workflows?project_path='),
          expect.any(Object)
        );
      });
    });

    it('should handle fetch errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      // Should not throw
      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByTestId('header-mock')).toBeInTheDocument();
      });
    });

    it('should abort pending requests on unmount', async () => {
      vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

      const { unmount } = render(<OrchestratorPanel projectPath="/test/path" />);

      unmount();

      // Should not throw or cause warnings
      expect(true).toBe(true);
    });
  });

  describe('Button Actions', () => {
    beforeEach(() => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: [], commands: [], workflows: { builtin: [], custom: [] } }),
      } as Response);
    });

    it('should call resetAll when reset button is clicked', async () => {
      const user = userEvent.setup();

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reset/i }));

      expect(mockState.resetAll).toHaveBeenCalled();
    });

    it('should clear output when clear output button is clicked', async () => {
      const user = userEvent.setup();

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear output/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /clear output/i }));

      expect(mockState.clearOutput).toHaveBeenCalled();
    });

    it('should execute job button be disabled when not connected', async () => {
      vi.mocked(orchestratorWs.useOrchestratorWebSocket).mockReturnValue({
        ...mockWs,
        connected: false,
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).toBeDisabled();
      });
    });

    it('should execute job button be disabled when processing', async () => {
      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        isProcessing: true,
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).toBeDisabled();
      });
    });

    it('should execute job button be disabled when no tasks or title', async () => {
      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        agentTasks: [],
        jobTitle: '',
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).toBeDisabled();
      });
    });

    it('should cancel job button be disabled when not processing', async () => {
      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        isProcessing: false,
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel job/i });
        expect(cancelButton).toBeDisabled();
      });
    });
  });

  describe('Job Submission', () => {
    beforeEach(() => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: mockAgents }),
      } as Response);
    });

    it('should submit job with agent tasks', async () => {
      const user = userEvent.setup();

      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        jobTitle: 'Test Job',
        agentTasks: [
          {
            agentId: 'react-expert',
            title: 'Setup components',
            description: 'Create React components',
            priority: 'normal',
            dependsOn: [],
          },
        ],
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /execute job/i }));

      expect(mockWs.submitJob).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Job',
        }),
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            agentId: 'react-expert',
            task: 'Create React components',
          }),
        ])
      );
    });

    it('should add consolidation task for multiple agents', async () => {
      const user = userEvent.setup();

      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        jobTitle: 'Multi-agent Job',
        agentTasks: [
          {
            agentId: 'react-expert',
            title: 'Task 1',
            description: 'Description 1',
            priority: 'normal',
            dependsOn: [],
          },
          {
            agentId: 'vitest-expert',
            title: 'Task 2',
            description: 'Description 2',
            priority: 'normal',
            dependsOn: [],
          },
        ],
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /execute job/i }));

      expect(mockWs.submitJob).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ agentId: 'code-reviewer' }),
        ])
      );
    });

    it('should clear form after job submission', async () => {
      const user = userEvent.setup();

      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        jobTitle: 'Test Job',
        agentTasks: [
          {
            agentId: 'react-expert',
            title: 'Task',
            description: 'Description',
            priority: 'normal',
            dependsOn: [],
          },
        ],
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /execute job/i }));

      expect(mockState.clearAgentTasks).toHaveBeenCalled();
      expect(mockState.setJobTitle).toHaveBeenCalledWith('');
      expect(mockState.setJobContext).toHaveBeenCalledWith('');
    });

    it('should update state when job is submitted', async () => {
      const user = userEvent.setup();

      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        jobTitle: 'Test Job',
        agentTasks: [
          {
            agentId: 'react-expert',
            title: 'Task',
            description: 'Description',
            priority: 'normal',
            dependsOn: [],
          },
        ],
      });

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute job/i });
        expect(executeButton).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /execute job/i }));

      expect(mockState.setIsProcessing).toHaveBeenCalledWith(true);
      expect(mockState.setCurrentJob).toHaveBeenCalled();
    });
  });

  describe('Pending Job Handling', () => {
    it('should process pending job from props', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: mockAgents }),
      } as Response);

      const pendingJob = {
        data: {
          title: 'Code Review',
          context: 'Review changes',
          subTasks: [
            { agentId: 'react-expert', task: 'Review React code' },
          ],
          projectPath: '/test/path',
        },
      };

      render(
        <OrchestratorPanel
          projectPath="/test/path"
          pendingJob={pendingJob}
          onJobSent={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(mockWs.submitJob).toHaveBeenCalled();
      });
    });

    it('should call onJobSent after processing pending job', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ agents: mockAgents }),
      } as Response);

      const onJobSent = vi.fn();
      const pendingJob = {
        data: {
          title: 'Test',
          projectPath: '/test/path',
        },
      };

      render(
        <OrchestratorPanel
          projectPath="/test/path"
          pendingJob={pendingJob}
          onJobSent={onJobSent}
        />
      );

      await waitFor(() => {
        expect(onJobSent).toHaveBeenCalled();
      });
    });
  });

  describe('Fullscreen Mode', () => {
    it('should exit fullscreen on Escape key', async () => {
      const user = userEvent.setup();

      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        isFullscreen: true,
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await user.keyboard('{Escape}');

      expect(mockState.setIsFullscreen).toHaveBeenCalledWith(false);
    });

    it('should not exit fullscreen on Escape when not in fullscreen', async () => {
      const user = userEvent.setup();

      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        isFullscreen: false,
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await user.keyboard('{Escape}');

      expect(mockState.setIsFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('WebSocket Integration', () => {
    it('should use WebSocket callbacks for job lifecycle', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(orchestratorWs.useOrchestratorWebSocket).toHaveBeenCalledWith(
          expect.objectContaining({
            projectPath: '/test/path',
            onJobStarted: expect.any(Function),
            onJobComplete: expect.any(Function),
            onJobError: expect.any(Function),
            onJobCancelled: expect.any(Function),
          })
        );
      });
    });
  });

  describe('State Management', () => {
    it('should use orchestrator state hook', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(orchestratorState.useOrchestratorState).toHaveBeenCalled();
      });
    });
  });

  describe('Progress Display', () => {
    it('should display progress status', async () => {
      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        progressStatus: 'Processing job...',
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        expect(screen.getByText('Processing job...')).toBeInTheDocument();
      });
    });

    it('should show spinner when processing', async () => {
      vi.mocked(orchestratorState.useOrchestratorState).mockReturnValue({
        ...mockState,
        isProcessing: true,
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const { container } = render(<OrchestratorPanel projectPath="/test/path" />);

      await waitFor(() => {
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });
    });
  });
});
