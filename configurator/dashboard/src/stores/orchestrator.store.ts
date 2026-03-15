// SPDX-License-Identifier: MIT
/**
 * Orchestrator Store - Manages job execution and chat session state
 *
 * This store handles the state for the orchestrator panel:
 * - WebSocket connection status
 * - Job queue and execution
 * - Chat session management
 * - Console output
 *
 * @example
 * ```tsx
 * const { connected, jobs, currentJob, appendOutput } = useOrchestratorStore();
 * ```
 */

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Job, JobStatus } from '@/types';

interface OrchestratorState {
  // ============================================
  // STATE
  // ============================================

  /** Whether WebSocket is connected */
  connected: boolean;

  /** List of all jobs (pending, running, completed, failed) */
  jobs: Job[];

  /** Currently executing job */
  currentJob: Job | null;

  /** Current chat session ID */
  chatSessionId: string | null;

  /** Console output lines */
  output: string[];

  /** Whether chat is active */
  chatActive: boolean;

  /** Current agent being used in chat */
  currentAgent: string | null;

  /** Whether waiting for user input */
  waitingForInput: boolean;

  // ============================================
  // ACTIONS
  // ============================================

  /** Set WebSocket connection status */
  setConnected: (connected: boolean) => void;

  /** Add a new job to the queue */
  addJob: (job: Job) => void;

  /** Update job status */
  updateJobStatus: (jobId: string, status: JobStatus) => void;

  /** Update job data */
  updateJob: (jobId: string, updates: Partial<Job>) => void;

  /** Set current executing job */
  setCurrentJob: (job: Job | null) => void;

  /** Remove job from queue */
  removeJob: (jobId: string) => void;

  /** Clear all completed/failed jobs */
  clearCompletedJobs: () => void;

  /** Set chat session ID */
  setChatSessionId: (sessionId: string | null) => void;

  /** Set chat active status */
  setChatActive: (active: boolean) => void;

  /** Set current agent */
  setCurrentAgent: (agent: string | null) => void;

  /** Set waiting for input status */
  setWaitingForInput: (waiting: boolean) => void;

  /** Append output line to console */
  appendOutput: (text: string) => void;

  /** Append multiple output lines */
  appendOutputLines: (lines: string[]) => void;

  /** Clear console output */
  clearOutput: () => void;

  /** Reset entire store */
  reset: () => void;

  /** Start a new chat session (clear output, reset session) */
  startNewChat: () => void;
}

const initialState = {
  connected: false,
  jobs: [],
  currentJob: null,
  chatSessionId: null,
  output: [],
  chatActive: false,
  currentAgent: null,
  waitingForInput: false,
};

/**
 * Orchestrator state management store
 */
const storeCreator: StateCreator<OrchestratorState, [['zustand/devtools', never]], []> = (set) => ({
  ...initialState,

  // ============================================
  // CONNECTION
  // ============================================

      setConnected: (connected: boolean) =>
        set({ connected }, false, 'setConnected'),

      // ============================================
      // JOBS
      // ============================================

      addJob: (job) =>
        set(
          (state) => ({
            jobs: [...state.jobs, job],
          }),
          false,
          'addJob'
        ),

      updateJobStatus: (jobId, status) =>
        set(
          (state) => ({
            jobs: state.jobs.map((job) =>
              job.id === jobId ? { ...job, status } : job
            ),
            currentJob:
              state.currentJob?.id === jobId
                ? { ...state.currentJob, status }
                : state.currentJob,
          }),
          false,
          'updateJobStatus'
        ),

      updateJob: (jobId, updates) =>
        set(
          (state) => ({
            jobs: state.jobs.map((job) =>
              job.id === jobId ? { ...job, ...updates } : job
            ),
            currentJob:
              state.currentJob?.id === jobId
                ? { ...state.currentJob, ...updates }
                : state.currentJob,
          }),
          false,
          'updateJob'
        ),

      setCurrentJob: (job) =>
        set({ currentJob: job }, false, 'setCurrentJob'),

      removeJob: (jobId) =>
        set(
          (state) => ({
            jobs: state.jobs.filter((job) => job.id !== jobId),
            currentJob: state.currentJob?.id === jobId ? null : state.currentJob,
          }),
          false,
          'removeJob'
        ),

      clearCompletedJobs: () =>
        set(
          (state) => ({
            jobs: state.jobs.filter(
              (job) => job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled'
            ),
          }),
          false,
          'clearCompletedJobs'
        ),

      // ============================================
      // CHAT SESSION
      // ============================================

      setChatSessionId: (sessionId) =>
        set({ chatSessionId: sessionId }, false, 'setChatSessionId'),

      setChatActive: (active) =>
        set({ chatActive: active }, false, 'setChatActive'),

      setCurrentAgent: (agent) =>
        set({ currentAgent: agent }, false, 'setCurrentAgent'),

      setWaitingForInput: (waiting) =>
        set({ waitingForInput: waiting }, false, 'setWaitingForInput'),

      startNewChat: () =>
        set(
          {
            chatSessionId: null,
            chatActive: false,
            currentAgent: null,
            output: [],
            waitingForInput: false,
          },
          false,
          'startNewChat'
        ),

      // ============================================
      // CONSOLE OUTPUT
      // ============================================

      appendOutput: (text) =>
        set(
          (state) => ({
            output: [...state.output, text],
          }),
          false,
          'appendOutput'
        ),

      appendOutputLines: (lines) =>
        set(
          (state) => ({
            output: [...state.output, ...lines],
          }),
          false,
          'appendOutputLines'
        ),

      clearOutput: () =>
        set({ output: [] }, false, 'clearOutput'),

      // ============================================
      // RESET
      // ============================================

      reset: () =>
        set(initialState, false, 'reset'),
});

export const useOrchestratorStore = create<OrchestratorState>()(
  devtools(storeCreator, { name: 'OrchestratorStore' })
);
