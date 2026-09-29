// SPDX-License-Identifier: MIT
/**
 * The real server over stdio: tools/list shape and error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { handlers } from '../src/handlers/index.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
let proc: ChildProcess;
let buf = '';
const pending = new Map<number, (m: any) => void>();
let id = 0;

function rpc(method: string, params: unknown): Promise<any> {
  return new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
  });
}

beforeAll(async () => {
  proc = spawn(process.execPath, ['--import', 'tsx', join(pkgDir, 'src', 'index.ts')], { cwd: pkgDir, stdio: ['pipe', 'pipe', 'ignore'] });
  proc.stdout!.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.(msg);
    }
  });
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
}, 60_000);

afterAll(() => {
  proc?.kill();
});

describe('MCP server', () => {
  it('lists exactly the registered tools, matching metadata.json', async () => {
    const res = await rpc('tools/list', {});
    const names = res.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(Object.keys(handlers).sort());
    const meta = JSON.parse(readFileSync(join(pkgDir, 'metadata.json'), 'utf-8'));
    expect([...meta.tools].sort()).toEqual(names);
  });

  it('benchmark_code exposes scriptPath and no longer requires code', async () => {
    const res = await rpc('tools/list', {});
    const bench = res.result.tools.find((t: { name: string }) => t.name === 'benchmark_code');
    expect(bench.inputSchema.properties.scriptPath).toBeDefined();
    expect(bench.inputSchema.required).toEqual(['runtime']);
  });

  it('keeps every tool description within 120 characters', async () => {
    const res = await rpc('tools/list', {});
    for (const t of res.result.tools) expect(t.description.length, t.name).toBeLessThanOrEqual(120);
  });

  it('returns isError with a message for bad input', async () => {
    const res = await rpc('tools/call', { name: 'profile_script', arguments: { scriptPath: 'relative/path.js' } });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/absolute/);
  });

  it('get_job for an unknown id is an error, not an empty success', async () => {
    const res = await rpc('tools/call', { name: 'get_job', arguments: { jobId: 'job-nope' } });
    expect(res.result.isError).toBe(true);
  });
});
