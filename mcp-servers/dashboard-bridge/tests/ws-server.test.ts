// SPDX-License-Identifier: MIT
/**
 * The orchestrator socket must never take the MCP server down with it.
 *
 * A second dev-suite session — or any stale process — holding the port used to
 * raise EADDRINUSE as an unhandled 'error' event, which Node turns into an
 * uncaught exception. The MCP transport died with it and every agent in the
 * session started getting transport errors from a side channel it was not
 * using.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';

import { startWebSocketServer } from '../src/ws-server.js';
import { handlers } from '../src/handlers/index.js';

const opened: Array<{ close(): Promise<void> }> = [];
const blockers: Server[] = [];

afterEach(async () => {
  for (const socket of opened.splice(0)) await socket.close().catch(() => {});
  for (const server of blockers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.restoreAllMocks();
});

/** Occupy a loopback port and report which one. */
function occupyPort(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      blockers.push(server);
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

describe('orchestrator WebSocket server', () => {
  it('binds and reports listening on a free port', async () => {
    const socket = startWebSocketServer({ port: 0, host: '127.0.0.1' });
    opened.push(socket);

    await expect(socket.listening).resolves.toBe(true);
  });

  it('survives EADDRINUSE, logs one line, and keeps serving MCP tools', async () => {
    const { port } = await occupyPort();
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const socket = startWebSocketServer({ port, host: '127.0.0.1' });
    opened.push(socket);

    // The bind fails...
    await expect(socket.listening).resolves.toBe(false);

    // ...with exactly one line about it, naming the port and the degradation.
    const lines = stderr.mock.calls.map((c) => String(c[0]));
    const inUse = lines.filter((l) => l.includes('already in use'));
    expect(inUse).toHaveLength(1);
    expect(inUse[0]).toContain(String(port));
    expect(inUse[0]).toContain('MCP server only');

    // ...and the process is still here, answering tool calls.
    const result = await handlers.list_pending_jobs({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
  });

  it('does not crash the process when the port is taken', async () => {
    const { port } = await occupyPort();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit must not be called');
    }) as never);

    const socket = startWebSocketServer({ port, host: '127.0.0.1' });
    opened.push(socket);
    await socket.listening;

    // Give any deferred error event a turn on the loop.
    await new Promise((r) => setTimeout(r, 50));
    expect(exit).not.toHaveBeenCalled();
  });
});
