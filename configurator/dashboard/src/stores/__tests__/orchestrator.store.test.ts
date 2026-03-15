// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach } from 'vitest';
import { useOrchestratorStore } from '../orchestrator.store';
import type { Job } from '@/types';

// Helper to create mock jobs
const createMockJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'test-job-1',
  title: 'Test Job',
  status: 'pending',
  projectPath: '/test/path',
  prompt: 'Test prompt',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('OrchestratorStore', () => {
  beforeEach(() => {
    useOrchestratorStore.getState().reset();
  });

  it('should set connection status', () => {
    const { setConnected } = useOrchestratorStore.getState();

    setConnected(true);
    expect(useOrchestratorStore.getState().connected).toBe(true);

    setConnected(false);
    expect(useOrchestratorStore.getState().connected).toBe(false);
  });

  it('should add jobs', () => {
    const { addJob } = useOrchestratorStore.getState();

    const job1: Job = { id: '1', type: 'task', status: 'pending', data: {} } as any;
    const job2: Job = { id: '2', type: 'task', status: 'pending', data: {} } as any;

    addJob(job1);
    addJob(job2);

    expect(useOrchestratorStore.getState().jobs).toHaveLength(2);
  });

  it('should update job status', () => {
    const { addJob, updateJobStatus } = useOrchestratorStore.getState();

    const job: Job = { id: '1', type: 'task', status: 'pending', data: {} } as any;
    addJob(job);

    updateJobStatus('1', 'running');
    expect(useOrchestratorStore.getState().jobs[0]?.status).toBe('running');

    updateJobStatus('1', 'completed');
    expect(useOrchestratorStore.getState().jobs[0]?.status).toBe('completed');
  });

  it('should update job result', () => {
    const { addJob, updateJob } = useOrchestratorStore.getState();

    const job = createMockJob({ id: '1', status: 'pending' });
    addJob(job);

    updateJob('1', { status: 'running', result: 'In progress' });

    const updated = useOrchestratorStore.getState().jobs[0];
    expect(updated?.status).toBe('running');
    expect(updated?.result).toBe('In progress');
  });

  it('should set current job', () => {
    const { setCurrentJob } = useOrchestratorStore.getState();

    const job: Job = { id: '1', type: 'task', status: 'running', data: {} } as any;

    setCurrentJob(job);
    expect(useOrchestratorStore.getState().currentJob).toEqual(job);

    setCurrentJob(null);
    expect(useOrchestratorStore.getState().currentJob).toBe(null);
  });

  it('should remove jobs', () => {
    const { addJob, removeJob } = useOrchestratorStore.getState();

    const job1: Job = { id: '1', type: 'task', status: 'pending', data: {} } as any;
    const job2: Job = { id: '2', type: 'task', status: 'pending', data: {} } as any;

    addJob(job1);
    addJob(job2);

    removeJob('1');
    expect(useOrchestratorStore.getState().jobs).toHaveLength(1);
    expect(useOrchestratorStore.getState().jobs[0]?.id).toBe('2');
  });

  it('should clear completed jobs', () => {
    const { addJob, clearCompletedJobs } = useOrchestratorStore.getState();

    addJob({ id: '1', type: 'task', status: 'completed', data: {} } as any);
    addJob({ id: '2', type: 'task', status: 'failed', data: {} } as any);
    addJob({ id: '3', type: 'task', status: 'pending', data: {} } as any);

    clearCompletedJobs();

    const jobs = useOrchestratorStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('3');
  });

  it('should manage chat session', () => {
    const { setChatSessionId, setChatActive, setCurrentAgent } = useOrchestratorStore.getState();

    setChatSessionId('session-123');
    expect(useOrchestratorStore.getState().chatSessionId).toBe('session-123');

    setChatActive(true);
    expect(useOrchestratorStore.getState().chatActive).toBe(true);

    setCurrentAgent('react-expert');
    expect(useOrchestratorStore.getState().currentAgent).toBe('react-expert');
  });

  it('should manage console output', () => {
    const { appendOutput, appendOutputLines, clearOutput } = useOrchestratorStore.getState();

    appendOutput('Line 1');
    appendOutput('Line 2');

    expect(useOrchestratorStore.getState().output).toEqual(['Line 1', 'Line 2']);

    appendOutputLines(['Line 3', 'Line 4']);
    expect(useOrchestratorStore.getState().output).toHaveLength(4);

    clearOutput();
    expect(useOrchestratorStore.getState().output).toEqual([]);
  });

  it('should start new chat session', () => {
    const store = useOrchestratorStore.getState();

    store.appendOutput('Old output');
    store.setChatSessionId('old-session');
    store.setChatActive(true);

    store.startNewChat();

    const state = useOrchestratorStore.getState();
    expect(state.output).toEqual([]);
    expect(state.chatSessionId).toBe(null);
    expect(state.chatActive).toBe(false);
  });

  it('should set waiting for input status', () => {
    const { setWaitingForInput } = useOrchestratorStore.getState();

    setWaitingForInput(true);
    expect(useOrchestratorStore.getState().waitingForInput).toBe(true);

    setWaitingForInput(false);
    expect(useOrchestratorStore.getState().waitingForInput).toBe(false);
  });
});
