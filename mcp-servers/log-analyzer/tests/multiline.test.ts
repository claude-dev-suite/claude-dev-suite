// SPDX-License-Identifier: MIT
/**
 * Multiline records and exception extraction. Audit: base.ts treated only
 * indented `at`/`File` lines as continuation, so the exception header line
 * (`java.lang.X: msg`, `ValueError: …`) was dropped or split off, and every
 * exception type came out `Unknown`.
 */

import { describe, it, expect } from 'vitest';
import { entriesOf } from './helpers.js';
import { SPRING_BOOT, PYTHON, NODE, GO_PANIC, DOTNET } from './fixtures.js';
import { extractException, parseHeader } from '../src/core/exceptions.js';

describe('Java', () => {
  it('keeps the header, frames, Caused by chain and "... N more" in one entry', async () => {
    const { entries, summary } = await entriesOf(SPRING_BOOT);
    expect(entries).toHaveLength(4);
    expect(summary.sources[0].unparsedLines).toBe(0);
    const e = entries[1];
    expect(e.level).toBe('ERROR');
    expect(e.exception?.type).toBe('java.lang.IllegalStateException');
    expect(e.exception?.message).toBe('Failed to load order 42');
    expect(e.exception?.stackTrace).toHaveLength(3);
    expect(e.exception?.language).toBe('java');
    const cause = e.exception?.causedBy;
    expect(cause?.type).toBe('java.sql.SQLTransientConnectionException');
    expect(cause?.omittedFrames).toBe(12);
    expect(cause?.causedBy?.type).toBe('java.net.ConnectException');
    expect(cause?.causedBy?.message).toBe('Connection refused');
    expect(cause?.causedBy?.omittedFrames).toBe(20);
  });

  it('handles "Exception in thread" crashes and Suppressed blocks', () => {
    const ex = extractException([
      'Exception in thread "main" java.lang.RuntimeException: boom',
      '\tat App.main(App.java:3)',
      '\tSuppressed: java.io.IOException: close failed',
      '\t\tat App.close(App.java:9)',
      'Caused by: java.lang.ArithmeticException: / by zero',
      '\tat App.div(App.java:12)',
    ]);
    expect(ex?.type).toBe('java.lang.RuntimeException');
    expect(ex?.message).toBe('boom');
    expect(ex?.causedBy?.type).toBe('java.lang.ArithmeticException');
  });
});

describe('Python', () => {
  it('attaches the traceback (including the closing "Type: msg" line) and chains', async () => {
    const { entries } = await entriesOf(PYTHON);
    expect(entries).toHaveLength(3);
    const e = entries[1];
    expect(e.message).toBe('Job failed');
    expect(e.exception?.type).toBe('app.errors.JobError');
    expect(e.exception?.message).toBe('bad payload');
    expect(e.exception?.language).toBe('python');
    expect(e.exception?.causedBy?.type).toBe('ValueError');
    expect(e.exception?.causeRelation).toBe('context');
    expect(e.exception?.causedBy?.stackTrace).toEqual(['/app/jobs.py:12 in run', '/app/jobs.py:30 in parse']);
  });

  it('marks "direct cause" chains as cause', () => {
    const ex = extractException([
      'Traceback (most recent call last):',
      '  File "a.py", line 1, in <module>',
      'KeyError: \'k\'',
      '',
      'The above exception was the direct cause of the following exception:',
      '',
      'Traceback (most recent call last):',
      '  File "a.py", line 3, in <module>',
      'RuntimeError: wrapped',
    ]);
    expect(ex?.type).toBe('RuntimeError');
    expect(ex?.causeRelation).toBe('cause');
    expect(ex?.causedBy?.type).toBe('KeyError');
  });

  it('an uncaught traceback with nothing before it becomes its own entry', async () => {
    const { entries } = await entriesOf('Traceback (most recent call last):\n  File "x.py", line 1, in <module>\nZeroDivisionError: division by zero\n', 'plain');
    expect(entries).toHaveLength(1);
    expect(entries[0].exception?.type).toBe('ZeroDivisionError');
    expect(entries[0].message).toBe('ZeroDivisionError: division by zero');
  });
});

describe('Node.js', () => {
  it('parses the stack of a JSON err object', async () => {
    const { entries } = await entriesOf(NODE);
    const e = entries[0];
    expect(e.exception?.type).toBe('TypeError');
    expect(e.exception?.stackTrace[0]).toContain('getUser');
    expect(e.exception?.language).toBe('node');
    expect(e.requestId).toBe('req-1');
  });

  it('parses a text stack with an error code and [cause]', () => {
    const ex = extractException([
      'request failed',
      'Error [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string',
      '    at open (node:fs:1:1)',
      '  [cause]: TypeError: bad',
      '      at x (/app/a.js:1:2)',
    ]);
    expect(ex?.type).toBe('Error [ERR_INVALID_ARG_TYPE]');
    expect(ex?.causedBy?.type).toBe('TypeError');
  });
});

describe('Go', () => {
  it('turns a raw panic into a FATAL entry with frames, not a continuation of the last log line', async () => {
    const { entries } = await entriesOf(GO_PANIC);
    expect(entries).toHaveLength(3);
    const p = entries[1];
    expect(p.level).toBe('FATAL');
    expect(p.exception?.type).toBe('runtime error');
    expect(p.exception?.message).toBe('index out of range [5] with length 3');
    expect(p.exception?.stackTrace).toEqual(['main.handler(0xc000010000) (/app/main.go:42)', 'main.main() (/app/main.go:12)']);
    expect(entries[2].message).toBe('restarted');
  });

  it('reads zap JSON stacktrace fields', async () => {
    const line = JSON.stringify({ level: 'error', ts: 1702463446.5, caller: 'srv/h.go:12', msg: 'handler failed', error: 'db: timeout', stacktrace: 'main.handle\n\t/app/h.go:12\nmain.main\n\t/app/main.go:5' });
    const { entries } = await entriesOf(line + '\n');
    expect(entries[0].exception?.type).toBe('Error');
    expect(entries[0].exception?.message).toBe('db: timeout');
    expect(entries[0].exception?.stackTrace).toEqual(['main.handle (/app/h.go:12)', 'main.main (/app/main.go:5)']);
    expect(entries[0].class).toBe('srv/h.go');
  });
});

describe('.NET', () => {
  it('splits ---> inner exceptions and assigns frames around "End of inner exception"', async () => {
    const { entries } = await entriesOf(DOTNET);
    expect(entries).toHaveLength(2);
    const e = entries[1];
    expect(e.logger).toBe('Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware');
    expect(e.message).toBe('An unhandled exception has occurred while executing the request.');
    expect(e.exception?.type).toBe('System.InvalidOperationException');
    expect(e.exception?.language).toBe('dotnet');
    expect(e.exception?.stackTrace).toHaveLength(2);
    expect(e.exception?.causedBy?.type).toBe('System.ArgumentNullException');
    expect(e.exception?.causedBy?.stackTrace[0]).toContain('Validate');
    expect(e.exception?.causeRelation).toBe('inner');
  });
});

describe('Ruby / Rails', () => {
  it('parses a tagged Rails exception with a tagged backtrace', async () => {
    const id = '8a1c7c2e-1f7b-4d7e-9a67-0e3f1c2d4b5a';
    const text = [
      `[${id}] Started GET "/users/1" for 127.0.0.1 at 2024-12-13 10:30:45 +0000`,
      `[${id}] Processing by UsersController#show as HTML`,
      `[${id}] Completed 500 Internal Server Error in 12ms (ActiveRecord: 1.1ms | Allocations: 900)`,
      `[${id}]   `,
      `[${id}] NoMethodError (undefined method \`name' for nil):`,
      `[${id}]   `,
      `[${id}] app/controllers/users_controller.rb:12:in \`show'`,
      `[${id}] app/controllers/application_controller.rb:5:in \`around'`,
    ].join('\n') + '\n';
    const { entries, summary } = await entriesOf(text);
    expect(summary.sources[0].format).toBe('rails');
    const completed = entries.find((e) => e.message.startsWith('Completed'))!;
    expect(completed.level).toBe('ERROR');
    expect(completed.metadata).toMatchObject({ status: 500, durationMs: 12, method: 'GET', path: '/users/1' });
    expect(completed.timestamp?.toISOString()).toBe('2024-12-13T10:30:45.000Z');
    expect(completed.requestId).toBe(id);
    const exc = entries.find((e) => e.exception)!;
    expect(exc.exception?.type).toBe('NoMethodError');
    expect(exc.exception?.stackTrace).toHaveLength(2);
    expect(exc.level).toBe('FATAL');
  });
});

describe('exception header parsing cost', () => {
  it('stays linear on a long run of $-joined identifiers (CodeQL js/redos)', () => {
    // `$` used to be both an identifier character and a separator, so this
    // input backtracked exponentially.
    const hostile = 'a$'.repeat(20000) + '!';
    const started = Date.now();
    parseHeader(hostile, false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('still reads a nested Java class as one type', () => {
    expect(parseHeader('com.example.Outer$InnerException: boom', true)).toEqual({
      type: 'com.example.Outer$InnerException',
      message: 'boom',
    });
  });
});
