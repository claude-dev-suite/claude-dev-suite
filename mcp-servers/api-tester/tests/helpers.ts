// SPDX-License-Identifier: MIT
/** Test helpers: a scriptable local HTTP server and fixture paths. */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http';
import type { AddressInfo } from 'net';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

export const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
export const fixture = (...p: string[]) => join(FIXTURES, ...p);

export interface Captured {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

export type Route = (req: IncomingMessage, res: ServerResponse, body: Buffer) => void | Promise<void>;

export interface TestServer {
  url: string;
  port: number;
  requests: Captured[];
  close: () => Promise<void>;
  server: Server;
}

export async function startServer(route: Route, host = '127.0.0.1'): Promise<TestServer> {
  const requests: Captured[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      Promise.resolve(route(req, res, body)).catch((e) => {
        res.writeHead(500);
        res.end(String(e));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, host, () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${host}:${port}`,
    port,
    requests,
    server,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

export function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

export function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'api-tester-'));
}

export function parseResult(r: { content: Array<{ text: string }> }): any {
  return JSON.parse(r.content[0].text);
}
