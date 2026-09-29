// SPDX-License-Identifier: MIT
/**
 * Live sources: exact CLI arguments, argument validation, attribution of
 * stdout/stderr, clear errors for a missing CLI — with a fake executor — plus
 * a real `docker logs` run that auto-skips when docker is unavailable.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { buildLiveCommand, fetchLive, type ExecFn } from '../src/sources/live.js';
import { call } from './helpers.js';
import { scan } from '../src/pipeline/index.js';

const fakeExec = (stdout: string, stderr = '', code = 0): ExecFn & { calls: Array<{ cmd: string; args: string[] }> } => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const fn = (async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return { stdout, stderr, code, timedOut: false, truncated: false };
  }) as ExecFn & { calls: typeof calls };
  fn.calls = calls;
  return fn;
};

describe('command construction', () => {
  it('docker logs with timestamps, tail and since', async () => {
    const c = await buildLiveCommand({ type: 'docker', container: 'api-1', since: '15m', tail: 500 });
    expect(c.cmd).toBe('docker');
    expect(c.args).toEqual(['logs', '--timestamps', '--tail', '500', '--since', '15m', 'api-1']);
    expect(c.envelope).toBe('ts-prefix');
  });

  it('kubectl by selector always passes --tail (it defaults to 10 with -l)', async () => {
    const c = await buildLiveCommand({ type: 'kubectl', namespace: 'shop', selector: 'app=api', container: 'app', previous: true, since: '1h' });
    expect(c.args).toEqual(['logs', '-n', 'shop', '-l', 'app=api', '-c', 'app', '--previous', '--tail=2000', '--timestamps', '--prefix', '--max-log-requests=20', '--since=1h']);
  });

  it('kubectl deployment target', async () => {
    const c = await buildLiveCommand({ type: 'kubectl', deployment: 'api', allContainers: true });
    expect(c.args).toContain('deployment/api');
    expect(c.args).toContain('--all-containers=true');
  });

  it('journalctl with relative since', async () => {
    const c = await buildLiveCommand({ type: 'journald', unit: 'nginx.service', since: '2h', tail: 100 });
    expect(c.args).toEqual(['-o', 'json', '--no-pager', '-n', '100', '-u', 'nginx.service', '--since', '-2h']);
  });

  it('rejects option injection and malformed names', async () => {
    await expect(buildLiveCommand({ type: 'docker', container: '--help' })).rejects.toThrow(/Invalid container/);
    await expect(buildLiveCommand({ type: 'docker', container: 'a;rm -rf /' })).rejects.toThrow(/Invalid container/);
    await expect(buildLiveCommand({ type: 'kubectl', pod: '-o=json' })).rejects.toThrow(/Invalid pod/);
    await expect(buildLiveCommand({ type: 'docker', container: 'x', since: '$(id)' })).rejects.toThrow(/Invalid since/);
    await expect(buildLiveCommand({ type: 'kubectl' })).rejects.toThrow(/required/);
  });
});

describe('fetching', () => {
  it('keeps a stderr line the detected payload format does not recognise', async () => {
    // Two lines are enough for "ERROR: first" to be detected as Python logging;
    // "second" on stderr then matched nothing and was dropped as unparsed.
    // Found by the real-docker test below on a CI runner that has docker.
    const exec = fakeExec('2026-09-29T16:37:50.100000000Z ERROR: first\n', '2026-09-29T16:37:50.100200000Z second\n');
    const entries: any[] = [];
    await scan({ source: { type: 'docker', container: 'x' } } as any, {} as any, (e: any) => { entries.push(e); return true; }, { exec });
    expect(entries.map((e) => [e.message, e.stream, e.level])).toEqual([
      ['first', 'stdout', 'ERROR'],
      ['second', 'stderr', 'ERROR'],
    ]);
    expect(entries[1].timestamp).toBeInstanceOf(Date);
  });

  it('merges docker stdout and stderr back into time order', async () => {
    const exec = fakeExec(
      '2024-12-13T10:30:45.000000000Z first\n2024-12-13T10:30:47.000000000Z third\n',
      '2024-12-13T10:30:46.000000000Z second on stderr\n',
    );
    const r = await fetchLive({ type: 'docker', container: 'api' }, exec);
    expect(r.lines.map((l) => [l.stream, l.text.slice(31)])).toEqual([['stdout', 'first'], ['stderr', 'second on stderr'], ['stdout', 'third']]);
  });

  it('a missing CLI is an actionable error', async () => {
    const exec: ExecFn = async () => { throw Object.assign(new Error('spawn kubectl ENOENT'), { code: 'ENOENT' }); };
    await expect(fetchLive({ type: 'kubectl', pod: 'p' }, exec)).rejects.toThrow(/"kubectl" was not found on PATH/);
  });

  it('a failing CLI surfaces its stderr instead of "no logs"', async () => {
    const exec = fakeExec('', 'Error from server (NotFound): pods "p" not found', 1);
    await expect(fetchLive({ type: 'kubectl', pod: 'p' }, exec)).rejects.toThrow(/NotFound/);
  });

  it('kubectl --prefix output: pod/container labels, per-container multiline, analysis end to end', async () => {
    const out = [
      '[pod/api-7d/app] 2024-12-13T10:30:45.000000000Z 2024-12-13 10:30:45.000 ERROR 1 --- [main] c.e.App : failed',
      '[pod/api-7d/app] 2024-12-13T10:30:45.000000000Z java.lang.IllegalStateException: boom',
      '[pod/api-9x/app] 2024-12-13T10:30:45.100000000Z 2024-12-13 10:30:45.100  INFO 1 --- [main] c.e.App : fine',
      '[pod/api-7d/app] 2024-12-13T10:30:45.000000000Z \tat c.e.App.run(App.java:10)',
    ].join('\n') + '\n';
    const r = await call('find_errors', { source: { type: 'kubectl', selector: 'app=api' } }, { exec: fakeExec(out) });
    expect(r.totalErrors).toBe(1);
    const g = r.errorGroups[0];
    expect(g.exceptionType).toBe('java.lang.IllegalStateException');
    expect(g.stackTrace).toEqual(['at c.e.App.run(App.java:10)']);
    expect(g.example.fields.pod).toBe('api-7d');
    expect(r.scan.sources[0].command).toMatch(/^kubectl logs -l app=api/);
  });

  it('journald JSON through the live source', async () => {
    const out = JSON.stringify({ __REALTIME_TIMESTAMP: '1702463445000000', PRIORITY: '3', MESSAGE: 'unit failed', _SYSTEMD_UNIT: 'a.service' }) + '\n';
    const r = await call('parse_logs', { source: { type: 'journald', unit: 'a.service' } }, { exec: fakeExec(out) });
    expect(r.entries[0]).toMatchObject({ level: 'ERROR', message: 'unit failed' });
    expect(r.formats[0].format).toBe('journald');
  });
});

function dockerUsable(): boolean {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!dockerUsable())('real docker (integration)', () => {
  it('reads logs of a short-lived container', async () => {
    const name = `log-analyzer-it-${Date.now()}`;
    execFileSync('docker', ['run', '--name', name, 'busybox', 'sh', '-c', 'echo "ERROR: first"; echo "second" 1>&2'], { stdio: 'pipe', timeout: 60000 });
    try {
      const r = await call('parse_logs', { source: { type: 'docker', container: name } });
      expect(r.matchedEntries).toBe(2);
      expect(r.entries.some((e: any) => e.stream === 'stderr')).toBe(true);
    } finally {
      execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
    }
  }, 90000);
});
