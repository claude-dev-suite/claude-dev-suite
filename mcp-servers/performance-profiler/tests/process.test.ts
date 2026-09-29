// SPDX-License-Identifier: MIT
/**
 * Process handling: no shell, tree kill on timeout, output caps, stop conditions.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectRuntime, findOnPath, isPidAlive, runCommand, spawnProcess } from '../src/utils/process.js';

const node = process.execPath;

describe('spawnProcess', () => {
  it('passes shell metacharacters literally (the old win32 path used shell:true)', async () => {
    const hostile = 'a & echo INJECTED | more > x; $(whoami) `id`';
    const r = await spawnProcess(node, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', hostile], { timeout: 20_000 });
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.trim())).toEqual([hostile]);
  });

  it('kills the whole process tree when the timeout elapses', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pp-tree-'));
    try {
      const pidFile = join(dir, 'child.pid');
      const parent = join(dir, 'parent.cjs');
      await writeFile(
        parent,
        `const { spawn } = require('child_process');
         const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
         require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
         setInterval(() => {}, 1000);`
      );
      const r = await spawnProcess(node, [parent], { timeout: 1500 });
      expect(r.timedOut).toBe(true);
      const childPid = Number(await readFile(pidFile, 'utf-8'));
      // give the OS a moment to reap
      for (let i = 0; i < 20 && isPidAlive(childPid); i++) await new Promise((res) => setTimeout(res, 100));
      expect(isPidAlive(childPid)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('caps captured output and says so', async () => {
    const r = await spawnProcess(node, ['-e', 'process.stdout.write("x".repeat(100000))'], { timeout: 20_000, maxOutputBytes: 1000 });
    expect(r.stdout.length).toBe(1000);
    expect(r.truncated).toBe(true);
  });

  it('stops a process when the condition becomes true, delivering lines on the way', async () => {
    const lines: string[] = [];
    let ready = false;
    const r = await spawnProcess(node, ['-e', 'setTimeout(() => console.log("READY now"), 200); setInterval(() => {}, 1000)'], {
      timeout: 20_000,
      onLine: (l) => {
        lines.push(l);
        if (l.includes('READY')) ready = true;
      },
      stopWhen: () => ready,
      pollMs: 20,
    });
    expect(r.stoppedByCondition).toBe(true);
    expect(r.timedOut).toBe(false);
    expect(lines).toContain('READY now');
  });

  it('reports a missing executable instead of throwing', async () => {
    const r = await runCommand({ cmd: 'definitely-not-a-real-binary-pp', args: [] }, { timeout: 5000 });
    expect(r.exitCode).not.toBe(0);
    expect(r.spawnError).toBeTruthy();
  });
});

describe('discovery helpers', () => {
  it('finds node on PATH', () => {
    expect(findOnPath('node')).toBeTruthy();
  });
  it('detects runtimes by extension and refuses to guess', () => {
    expect(detectRuntime('/x/app.ts')).toBe('nodejs');
    expect(detectRuntime('/x/app.py')).toBe('python');
    expect(detectRuntime('/x/app.jar')).toBe('java');
    expect(detectRuntime('/x/main.go')).toBe('go');
    expect(detectRuntime('/x/App.dll')).toBe('dotnet');
    expect(() => detectRuntime('/x/app.rb')).toThrow(/runtime/);
  });
});
