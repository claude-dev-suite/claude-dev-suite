// SPDX-License-Identifier: MIT
/**
 * The built bundle must run with no node_modules beside it (WASM inlined) and
 * list exactly the tools metadata.json declares. Skipped until `npm run build`.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const dist = path.resolve(__dirname, '..', 'dist', 'index.js');
const metadata = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'metadata.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));

function rpc(server: string, cwd: string, messages: object[], waitFor: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [server], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const replies: any[] = [];
    let buf = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('timeout waiting for MCP replies'));
    }, 60_000);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        replies.push(JSON.parse(line));
        if (replies.filter((r) => r.id !== undefined).length >= waitFor) {
          clearTimeout(timer);
          child.kill();
          resolve(replies);
        }
      }
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
  });
}

describe.runIf(existsSync(dist))('bundled dist/index.js', () => {
  it('initialises, lists the declared tools and parses code from an isolated directory', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cq-bundle-'));
    try {
      const server = path.join(dir, 'server.mjs');
      copyFileSync(dist, server);
      writeFileSync(path.join(dir, 'sample.py'), 'def f(a):\n    if a:\n        return 1\n    return 2\n');
      const replies = await rpc(
        server,
        dir,
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
          { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'analyze_complexity', arguments: { path: path.join(dir, 'sample.py'), includeAll: true, format: 'json' } } },
        ],
        3
      );
      const byId = Object.fromEntries(replies.filter((r) => r.id).map((r) => [r.id, r]));
      expect(byId[1].result.serverInfo).toEqual({ name: 'code-quality', version: pkg.version });
      expect(byId[2].result.tools.map((t: { name: string }) => t.name).sort()).toEqual([...metadata.tools].sort());
      for (const t of byId[2].result.tools) expect(t.description.length).toBeLessThanOrEqual(120);
      const data = JSON.parse(byId[3].result.content[0].text);
      expect(data.functions[0]).toMatchObject({ name: 'f', cyclomatic: 2, cognitive: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
