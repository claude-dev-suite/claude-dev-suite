// SPDX-License-Identifier: MIT
/**
 * What the orchestrator socket hands the panel when a job finishes.
 *
 * `job_complete` and `chat_complete` have always carried `success`
 * (`!message.is_error` on the server). The hook destructured `sessionId`,
 * `recap` and `jobContext` out of the payload and dropped the rest, so the
 * panel had nothing to branch on and announced success unconditionally.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOrchestratorWebSocket } from '../hooks/useOrchestratorWebSocket';

/** Minimal stand-in for the browser socket: we only drive `onmessage`. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  deliver(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

async function connect() {
  const onJobComplete = vi.fn();

  renderHook(() =>
    useOrchestratorWebSocket({ projectPath: '/test/path', onJobComplete })
  );

  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  const socket = FakeWebSocket.instances[0]!;

  return { socket, onJobComplete };
}

describe('job_complete', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { wsToken: 't', wsPort: 4711 } }),
      })) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes the failure through instead of swallowing it', async () => {
    const { socket, onJobComplete } = await connect();

    act(() => {
      socket.deliver({
        type: 'job_complete',
        payload: {
          jobId: 'job-1',
          success: false,
          exitCode: 1,
          error: 'Step 2 of 3 (@vitest-expert) failed',
          sessionId: 'sess-1',
        },
      });
    });

    expect(onJobComplete).toHaveBeenCalledWith(
      { success: false, error: 'Step 2 of 3 (@vitest-expert) failed' },
      'sess-1',
      undefined,
      undefined,
    );
  });

  it('passes a success through as a success', async () => {
    const { socket, onJobComplete } = await connect();

    act(() => {
      socket.deliver({
        type: 'job_complete',
        payload: { jobId: 'job-1', success: true, exitCode: 0, sessionId: 'sess-1' },
      });
    });

    expect(onJobComplete.mock.calls[0]?.[0]).toEqual({ success: true, error: undefined });
  });

  it('treats a payload with no success field as a success', async () => {
    // An older server only ever broadcast this message on a clean finish.
    const { socket, onJobComplete } = await connect();

    act(() => {
      socket.deliver({ type: 'job_complete', payload: { jobId: 'job-1' } });
    });

    expect(onJobComplete.mock.calls[0]?.[0]?.success).toBe(true);
  });

  it('carries the same verdict for a chat turn', async () => {
    const { socket, onJobComplete } = await connect();

    act(() => {
      socket.deliver({
        type: 'chat_complete',
        payload: { success: false, result: '', cost: 0, sessionId: 'sess-2' },
      });
    });

    expect(onJobComplete.mock.calls[0]?.[0]?.success).toBe(false);
  });
});
