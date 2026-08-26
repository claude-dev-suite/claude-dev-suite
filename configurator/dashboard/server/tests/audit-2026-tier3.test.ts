// SPDX-License-Identifier: MIT
/**
 * Regression tests for the orchestrator half of Tier 3 of the 2026-08 audit.
 *
 *  28  `executeJob`'s finally released the slot even after `force_unstick` had
 *      handed it to another job — two jobs running, one uncancellable
 *  29  the interactive permission gate ran on the streamed assistant message,
 *      i.e. after the SDK had already acted on the tool
 *  30  sub-task outputs were keyed by agentId, so two steps using the same
 *      agent overwrote each other
 *
 * The MCP-server half (#23–#27) is covered inside each server's own package:
 * mcp-servers/shared/tests/security.test.ts, api-tester/tests/ssrf-protection,
 * documentation/tests/kb-path, log-analyzer/tests/export-path-security,
 * database-query/tests/backup-path-security.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobPromptService } from '../src/services/orchestrator/job-prompt.service.js';
import { PermissionService } from '../src/services/orchestrator/permission.service.js';

// ─── 30: outputs are addressable by position ────────────────────────────────

describe('Tier 3 #30 — repeated agents keep their own sub-task output', () => {
  const sdkStub = {
    truncateOutput: (s: string) => s,
  } as unknown as ConstructorParameters<typeof JobPromptService>[0];

  const service = new JobPromptService(sdkStub);

  /** A three-step plan that uses `backend-expert` twice. */
  function jobAtStep(index: number) {
    return {
      id: 'job-1',
      title: 'Repeat',
      prompt: 'do the thing',
      agentId: 'backend-expert',
      subTasks: [
        { agentId: 'backend-expert', task: 'first pass' },
        { agentId: 'testing-expert', task: 'write tests' },
        { agentId: 'backend-expert', task: 'second pass' },
      ],
      currentSubTaskIndex: index,
      completedSubTasks: {
        // What the agentId-keyed map ends up holding: step 2 overwrote step 0.
        'backend-expert': 'SECOND PASS OUTPUT',
        'testing-expert': 'TEST OUTPUT',
      },
      completedSubTaskOutputs: ['FIRST PASS OUTPUT', 'TEST OUTPUT', 'SECOND PASS OUTPUT'],
    } as never;
  }

  it('quotes the immediately preceding step, not the last run of that agent', () => {
    // At step 1 the previous step is index 0 — `backend-expert`'s FIRST pass.
    const prompt = service.generateSubTaskPrompt(jobAtStep(1));

    expect(prompt).toContain('FIRST PASS OUTPUT');
    expect(prompt).not.toContain('SECOND PASS OUTPUT');
  });

  it('falls back to the agentId map when positional output is absent', () => {
    const job = jobAtStep(1) as unknown as Record<string, unknown>;
    delete job.completedSubTaskOutputs;

    const prompt = service.generateSubTaskPrompt(job as never);
    // Legacy jobs (queued before the field existed) must still get context.
    expect(prompt).toContain('SECOND PASS OUTPUT');
  });

  it('still resolves explicit dependencies by agent id', () => {
    const job = jobAtStep(2) as unknown as Record<string, unknown>;
    (job.subTasks as Array<Record<string, unknown>>)[2].dependencies = ['testing-expert'];

    const prompt = service.generateSubTaskPrompt(job as never);
    expect(prompt).toContain('TEST OUTPUT');
  });
});

// ─── 29: the permission gate is preventive and fail-closed ──────────────────

describe('Tier 3 #29 — the permission service is fail-closed', () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
    vi.useFakeTimers();
  });

  it('denies an unanswered request when it times out', async () => {
    const pending = service.createRequest('req-1', 1000);
    vi.advanceTimersByTime(1001);

    // The dialog auto-*allows* on timeout; the server must not.
    await expect(pending).resolves.toBe('deny');
  });

  it('honours an explicit allow', async () => {
    const pending = service.createRequest('req-2', 1000);
    expect(service.resolveRequest('req-2', 'allow')).toBe(true);
    await expect(pending).resolves.toBe('allow');
  });

  it('classifies a destructive shell command as high risk or worse', () => {
    const risk = service.classifyOperation('Bash', { command: 'rm -rf /important' });
    expect(['high', 'critical']).toContain(risk.risk);
  });

  it('leaves an ordinary read below the gate threshold', () => {
    const risk = service.classifyOperation('Read', { file_path: '/tmp/a.txt' });
    expect(['low', 'medium']).toContain(risk.risk);
  });
});

// ─── 28 / 29: what the job queue passes to the SDK ──────────────────────────

describe('Tier 3 #28/#29 — job queue wiring', () => {
  it('passes a canUseTool callback only for interactive jobs', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../src/services/orchestrator/job-queue.service.ts', import.meta.url),
        'utf-8'
      )
    );

    // A structural assertion, because driving the real SDK in a unit test is
    // not feasible: the gate must be handed to `query()` (preventive) rather
    // than applied to the streamed assistant message (after the fact).
    expect(source).toContain('canUseTool: this.buildCanUseTool(');
    expect(source).toContain("behavior: 'deny'");

    // The post-hoc check must be gone: its presence is the bug.
    expect(source).not.toContain('// Permission check for interactive mode');
  });

  it('releases the execution slot only when the finishing job still owns it', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL('../src/services/orchestrator/job-queue.service.ts', import.meta.url),
        'utf-8'
      )
    );

    expect(source).toContain('if (this.state.current !== job)');
    // The ownership check must come before the fields are cleared.
    const guardAt = source.indexOf('if (this.state.current !== job)');
    const clearAt = source.indexOf('this.state.current = null;', guardAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(guardAt);
  });
});
