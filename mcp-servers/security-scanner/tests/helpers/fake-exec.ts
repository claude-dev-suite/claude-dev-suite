// SPDX-License-Identifier: MIT
/**
 * Fake CLI layer for scanner tests: every tool name maps to a handler that
 * receives the argument array and returns what the process would print.
 * Version probes are answered automatically so `getTool()` sees the tool.
 */

import { setExecImpl, type RunOptions, type RunResult } from '../../src/utils/exec.js';
import { clearToolCache } from '../../src/utils/tool-checker.js';

export type Handler = (args: string[], opts: RunOptions) => Partial<RunResult> | Promise<Partial<RunResult>>;

export interface Call {
  tool: string;
  args: string[];
  cwd: string;
}

const VERSION_OUTPUT: Record<string, string> = {
  trivy: 'Version: 0.74.0',
  'osv-scanner': 'osv-scanner version: 2.6.0',
  semgrep: '1.178.0',
  gitleaks: '8.30.1',
  trufflehog: 'trufflehog 3.97.9',
  syft: 'Version: 1.20.0',
  npm: '10.9.4',
  pnpm: '9.15.0',
  yarn: '1.22.22',
  'pip-audit': 'pip-audit 2.10.1',
  'cargo-audit': 'cargo-audit-audit 0.21.0',
  govulncheck: 'Go: go1.23\nScanner: govulncheck@v1.1.4',
  git: 'git version 2.47.0',
};

function isVersionProbe(tool: string, args: string[]): boolean {
  const a = args.join(' ');
  if (tool === 'cargo-audit') return a === 'audit --version';
  return a === '--version' || a === 'version' || a === '-version';
}

export function fakeExec(handlers: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  clearToolCache();
  setExecImpl({
    resolver: (name) => (handlers[name] ? { command: name, prefixArgs: [], source: `/fake/bin/${name}` } : null),
    runner: async (cmd, args, opts) => {
      const base: RunResult = { exitCode: 0, stdout: '', stderr: '', timedOut: false, truncated: false };
      if (isVersionProbe(cmd.command, args)) return { ...base, stdout: VERSION_OUTPUT[cmd.command] ?? '1.0.0' };
      calls.push({ tool: cmd.command, args, cwd: opts.cwd });
      const out = await handlers[cmd.command](args, opts);
      return { ...base, ...out };
    },
  });
  return calls;
}

export function resetExec(): void {
  setExecImpl();
  clearToolCache();
}

/** Value following a flag in an argument array. */
export function argAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
