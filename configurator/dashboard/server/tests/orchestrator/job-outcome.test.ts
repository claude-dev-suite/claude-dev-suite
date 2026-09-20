// SPDX-License-Identifier: MIT
/**
 * What a finished job reports, and what it costs to get there.
 *
 * A multi-step job set `job.status = 'completed'` after its loop, whatever the
 * steps did. `result.success` was read only to broadcast a per-subtask event,
 * so a chain whose first agent errored ran every remaining agent against its
 * broken output — paying for each one — and then announced success. Each
 * step's prompt is built from the previous step's output, so there was nothing
 * to salvage by continuing.
 *
 * `job_complete` derives `success` and `exitCode` from `job.status`, which is
 * why the wrong status reached the dashboard as a green check mark.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: queryMock }));
vi.mock('../../src/services/credentials.service.js', () => ({
  credentialsService: { buildAgentEnv: () => ({}) },
}));

const { JobQueueService } = await import('../../src/services/orchestrator/job-queue.service.js');
type JobQueueServiceType = InstanceType<typeof JobQueueService>;

const PROJECT = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';

/** One SDK turn: some assistant text, then a result carrying `is_error`. */
function turn(text: string, isError: boolean): SDKMessage[] {
  return [
    { type: 'system', subtype: 'init', session_id: 'sess-1' },
    { type: 'assistant', message: { content: [{ type: 'text', text }] } },
    { type: 'result', is_error: isError, total_cost_usd: 0.25 },
  ] as unknown as SDKMessage[];
}

/** Feed one scripted turn per `query()` call, in order. */
function scriptTurns(turns: SDKMessage[][]) {
  let call = 0;
  queryMock.mockImplementation(() => {
    const messages = turns[call] ?? turns[turns.length - 1] ?? [];
    call++;
    return (async function* () {
      for (const message of messages) yield message;
    })();
  });
  return () => call;
}

function build() {
  const broadcasts: Array<{ type: string; payload: Record<string, unknown> }> = [];

  const wsClientService = {
    broadcast: (message: { type: string; payload?: unknown }) =>
      broadcasts.push({
        type: message.type,
        payload: (message.payload ?? {}) as Record<string, unknown>,
      }),
  };

  const sdkService = {
    isSystemInitMessage: (m: { type?: string; subtype?: string }) =>
      m.type === 'system' && m.subtype === 'init',
    isAssistantMessage: (m: { type?: string }) => m.type === 'assistant',
    isUserMessage: (m: { type?: string }) => m.type === 'user',
    isResultMessage: (m: { type?: string }) => m.type === 'result',
    parseAPIError: (err: Error) => ({
      type: 'unknown',
      userMessage: err.message,
      retryable: false,
      suggestions: [],
    }),
    formatErrorForDisplay: (parsed: { userMessage: string }) => parsed.userMessage,
    // Carried-forward output is truncated from step 2 onward.
    truncateOutput: (text: string) => text,
  };

  const validationService = {
    validateProjectPath: () => ({ valid: true, path: PROJECT }),
    validateAgentId: () => true,
    getInstalledAgents: () => new Set<string>(['react-expert', 'vitest-expert', 'docs-expert']),
  };

  const config = {
    job: { permissionMode: 'bypassPermissions', maxTurns: 5, maxBudgetUsd: 0 },
  };

  const service = new JobQueueService(
    config as never,
    validationService as never,
    wsClientService as never,
    sdkService as never,
  );

  return { service, broadcasts };
}

function job(subTasks: Array<{ agentId: string; task: string }>) {
  return {
    id: 'job-1',
    title: 'Ship the thing',
    prompt: 'do it',
    status: 'queued',
    createdAt: new Date().toISOString(),
    projectPath: PROJECT,
    subTasks,
  };
}

/** `executeJob` is private; the queue is the only public way in. */
async function run(service: JobQueueServiceType, j: ReturnType<typeof job>) {
  await (service as unknown as { executeJob: (j: unknown) => Promise<void> }).executeJob(j);
}

const STEPS = [
  { agentId: 'react-expert', task: 'build it' },
  { agentId: 'vitest-expert', task: 'test it' },
  { agentId: 'docs-expert', task: 'document it' },
];

describe('a multi-step job that fails', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('is reported as failed, not completed', async () => {
    scriptTurns([turn('step one exploded', true)]);
    const { service, broadcasts } = build();
    const j = job(STEPS);

    await run(service, j);

    expect(j.status).toBe('failed');

    const complete = broadcasts.find(b => b.type === 'job_complete');
    expect(complete?.payload.success).toBe(false);
    expect(complete?.payload.exitCode).toBe(1);
  });

  it('stops at the failed step instead of paying for the rest of the chain', async () => {
    const calls = scriptTurns([turn('step one exploded', true)]);
    const { service } = build();

    await run(service, job(STEPS));

    // One agent run, not three. Each step's prompt is built from the previous
    // step's output, so the remaining two would have worked from wreckage.
    expect(calls()).toBe(1);
  });

  it('says which step failed', async () => {
    scriptTurns([turn('ok', false), turn('the tests blew up', true)]);
    const { service, broadcasts } = build();
    const j = job(STEPS);

    await run(service, j);

    expect(j.error).toBe('Step 2 of 3 (@vitest-expert) failed');
    expect(broadcasts.find(b => b.type === 'job_complete')?.payload.error).toBe(
      'Step 2 of 3 (@vitest-expert) failed',
    );
  });

  it('keeps the output produced before the failure', async () => {
    scriptTurns([turn('found three problems', false), turn('crashed', true)]);
    const { service, broadcasts } = build();

    await run(service, job(STEPS));

    const complete = broadcasts.find(b => b.type === 'job_complete');
    const context = complete?.payload.jobContext as { findings: string } | undefined;
    expect(context?.findings).toContain('found three problems');
  });
});

describe('a multi-step job that succeeds', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('runs every step and reports success', async () => {
    const calls = scriptTurns([turn('a', false), turn('b', false), turn('c', false)]);
    const { service, broadcasts } = build();
    const j = job(STEPS);

    await run(service, j);

    expect(calls()).toBe(3);
    expect(j.status).toBe('completed');
    expect(broadcasts.find(b => b.type === 'job_complete')?.payload.success).toBe(true);
    expect(broadcasts.find(b => b.type === 'job_complete')?.payload.exitCode).toBe(0);
  });
});

describe('a single-step job', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('reports the failure the SDK returned', async () => {
    scriptTurns([turn('nope', true)]);
    const { service, broadcasts } = build();
    const j = job([{ agentId: 'react-expert', task: 'build it' }]);

    await run(service, j);

    expect(j.status).toBe('failed');
    expect(broadcasts.find(b => b.type === 'job_complete')?.payload.success).toBe(false);
  });
});
