// SPDX-License-Identifier: MIT
/**
 * Envelopes: the runtime wrapper is unwrapped first, so the payload's own
 * format is detected and its multi-line records are re-joined.
 */

import { describe, it, expect } from 'vitest';
import { entriesOf } from './helpers.js';
import { SPRING_BOOT } from './fixtures.js';
import { detectFormat } from '../src/parsers/index.js';

const dockerLines = (text: string, stream = 'stdout') =>
  text.split('\n').filter(Boolean).map((l, i) => JSON.stringify({ log: l + '\n', stream, time: `2024-12-13T10:30:${String(i).padStart(2, '0')}.000000000Z` }));

describe('docker json-file', () => {
  it('detects the envelope and the Spring Boot payload, and re-joins its stack trace', async () => {
    const text = dockerLines(SPRING_BOOT).join('\n') + '\n';
    expect(detectFormat(text.split('\n').slice(0, 30))).toMatchObject({ envelope: 'docker', format: 'spring-boot' });
    const { entries } = await entriesOf(text);
    expect(entries).toHaveLength(4);
    expect(entries[1].exception?.causedBy?.causedBy?.type).toBe('java.net.ConnectException');
    expect(entries[1].stream).toBe('stdout');
  });

  it('joins partial (>16 KB) records split without a trailing newline', async () => {
    const lines = [
      JSON.stringify({ log: '{"level":"info","msg":"part-', stream: 'stdout', time: '2024-12-13T10:30:45Z' }),
      JSON.stringify({ log: 'two"}\n', stream: 'stdout', time: '2024-12-13T10:30:45Z' }),
    ];
    const { entries } = await entriesOf(lines.join('\n') + '\n', 'docker');
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('part-two');
  });
});

describe('CRI (containerd / CRI-O)', () => {
  it('re-joins P chunks and keeps stdout/stderr separate', async () => {
    const text = [
      '2024-12-13T10:30:45.000000001Z stdout P {"level":"error","msg":"hel',
      '2024-12-13T10:30:45.000000002Z stderr F plain stderr line',
      '2024-12-13T10:30:45.000000003Z stdout F lo"}',
    ].join('\n') + '\n';
    const { entries, summary } = await entriesOf(text);
    expect(summary.sources[0].envelope).toBe('cri');
    const msgs = entries.map((e) => e.message).sort();
    expect(msgs).toContain('hello');
    expect(entries.find((e) => e.message === 'hello')?.level).toBe('ERROR');
  });
});

describe('Heroku', () => {
  it('unwraps app/router lines; router payload is logfmt', async () => {
    const text = [
      '2024-12-13T10:30:45.123456+00:00 heroku[router]: at=info method=GET path="/" host=a.herokuapp.com request_id=abc-123 fwd="1.2.3.4" dyno=web.1 connect=0ms service=15ms status=200 bytes=10 protocol=https',
      '2024-12-13T10:30:46.000000+00:00 heroku[router]: at=error code=H12 desc="Request timeout" method=GET path="/slow" host=a.herokuapp.com request_id=def-456 fwd="1.2.3.4" dyno=web.1 connect=0ms service=30000ms status=503 bytes=0 protocol=https',
    ].join('\n') + '\n';
    const { entries, summary } = await entriesOf(text);
    expect(summary.sources[0].envelope).toBe('heroku');
    expect(entries[1].level).toBe('ERROR');
    expect(entries[1].metadata).toMatchObject({ code: 'H12', status: 503, durationMs: 30000, dyno: 'web.1' });
    expect(entries[0].requestId).toBe('abc-123');
  });
});

describe('CloudWatch', () => {
  it('reads a pretty-printed filter-log-events document with multi-line messages', async () => {
    const doc = JSON.stringify({
      events: [
        { logStreamName: 's1', timestamp: 1702463445000, message: 'START RequestId: 1\n', ingestionTime: 1, eventId: 'a' },
        { logStreamName: 's1', timestamp: 1702463446000, message: '[ERROR] ValueError: bad\nTraceback (most recent call last):\n  File "/var/task/app.py", line 3, in handler\nValueError: bad\n', ingestionTime: 1, eventId: 'b' },
      ],
    }, null, 2);
    const { entries, summary } = await entriesOf(doc, 'auto', 'export.json');
    expect(summary.sources[0].envelope).toBe('cloudwatch');
    const err = entries.find((e) => e.exception)!;
    expect(err.exception?.type).toBe('ValueError');
    expect(err.timestamp?.toISOString()).toBe('2023-12-13T10:30:46.000Z');
    expect(err.metadata?.logStream).toBe('s1');
  });
});

describe('OpenTelemetry', () => {
  it('expands OTLP/JSON resourceLogs into entries with trace/span ids and resource attributes', async () => {
    const doc = {
      resourceLogs: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
        scopeLogs: [{
          scope: { name: 'checkout.http' },
          logRecords: [
            { timeUnixNano: '1702463445000000000', severityNumber: 17, severityText: 'ERROR', body: { stringValue: 'payment failed' }, traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7', attributes: [{ key: 'exception.type', value: { stringValue: 'PaymentError' } }, { key: 'exception.message', value: { stringValue: 'card declined' } }] },
            { timeUnixNano: '1702463446000000000', severityNumber: 9, body: { stringValue: 'ok' } },
          ],
        }],
      }],
    };
    const { entries, summary } = await entriesOf(JSON.stringify(doc) + '\n');
    expect(summary.sources[0]).toMatchObject({ envelope: 'otlp', format: 'otel' });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ level: 'ERROR', message: 'payment failed', traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7', logger: 'checkout.http' });
    expect(entries[0].exception?.type).toBe('PaymentError');
    expect(entries[0].timestamp?.toISOString()).toBe('2023-12-13T10:30:45.000Z');
    expect(entries[1].level).toBe('INFO');
  });
});
