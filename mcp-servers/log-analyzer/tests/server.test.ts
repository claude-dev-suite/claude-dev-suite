// SPDX-License-Identifier: MIT
/**
 * The real server over stdio: ListTools matches metadata.json, and the process
 * exits when its client goes away even while a watcher is running (the old
 * SIGINT/SIGTERM handlers only stopped watchers, and an un-unref'd poll timer
 * kept the process alive).
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFixtures } from './fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');

function startServer() {
  const child = spawn(process.execPath, [tsxCli, join(pkgDir, 'src', 'index.ts')], { cwd: pkgDir, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const waiting = new Map<number, (v: any) => void>();
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      waiting.get(msg.id)?.(msg);
    }
  });
  let id = 0;
  const request = (method: string, params: unknown = {}) => new Promise<any>((resolve) => {
    const myId = ++id;
    waiting.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
  });
  const notify = (method: string) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  return { child, request, notify };
}

describe('stdio server', () => {
  it('lists exactly the tools declared in metadata.json and exits when stdin closes', async () => {
    const { child, request, notify } = startServer();
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(init.result.serverInfo).toMatchObject({ name: 'log-analyzer-server' });
    notify('notifications/initialized');

    const list = await request('tools/list');
    const names = list.result.tools.map((t: any) => t.name).sort();
    const meta = JSON.parse(readFileSync(join(pkgDir, 'metadata.json'), 'utf-8'));
    expect(names).toEqual([...meta.tools].sort());
    for (const t of list.result.tools) expect(t.description.length).toBeLessThanOrEqual(120);

    const dir = writeFixtures({ 'w.log': '' });
    const started = await request('tools/call', { name: 'watch_logs', arguments: { action: 'start', filePath: join(dir, 'w.log') } });
    expect(started.result.isError).toBeUndefined();

    const bad = await request('tools/call', { name: 'parse_logs', arguments: { filePath: 'relative.log' } });
    expect(bad.result.isError).toBe(true);
    expect(JSON.parse(bad.result.content[0].text).error).toMatch(/absolute/);

    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    child.stdin.end();
    const code = await Promise.race([exited, new Promise<string>((r) => setTimeout(() => r('timeout'), 10000))]);
    if (code === 'timeout') child.kill('SIGKILL');
    expect(code).toBe(0);
  }, 60000);
});
