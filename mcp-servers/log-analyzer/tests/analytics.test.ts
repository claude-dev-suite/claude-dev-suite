// SPDX-License-Identifier: MIT
/**
 * Template mining (Drain), correlation / trace timelines, access analytics.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { call } from './helpers.js';
import { writeFixtures, NGINX, LOGFMT } from './fixtures.js';
import { Drain, templateText } from '../src/core/drain.js';
import { enrichCorrelation } from '../src/core/correlation.js';
import type { LogEntry } from '../src/types.js';

describe('Drain', () => {
  it('clusters messages that differ only in variables', () => {
    const d = new Drain();
    for (let i = 0; i < 20; i++) d.add(`Connected to db-${i % 3} in ${i * 7}ms`);
    for (let i = 0; i < 5; i++) d.add(`User alice${i} logged in from 10.0.0.${i}`);
    d.add('Shutting down');
    const t = d.clusters.map((c) => [templateText(c), c.size]).sort((a, b) => (b[1] as number) - (a[1] as number));
    expect(t).toEqual([
      ['Connected to db-<num> in <num>', 20],
      ['User <*> logged in from <ip>', 5],
      ['Shutting down', 1],
    ]);
  });

  it('mine_templates reports counts, shares and levels', async () => {
    const lines = [];
    for (let i = 0; i < 30; i++) lines.push(`2024-12-13 10:00:${String(i).padStart(2, '0')},000 - app - INFO - Processed order ${1000 + i} for customer c${i}`);
    for (let i = 0; i < 10; i++) lines.push(`2024-12-13 10:01:${String(i).padStart(2, '0')},000 - app - ERROR - Timeout calling inventory after ${i * 100}ms`);
    const dir = writeFixtures({ 'a.log': lines.join('\n') + '\n' });
    const r = await call('mine_templates', { filePath: join(dir, 'a.log') });
    expect(r.messages).toBe(40);
    expect(r.templates[0]).toMatchObject({ template: 'Processed order <num> for customer <*>', count: 30, share: 75 });
    expect(r.templates[1].levels).toEqual({ ERROR: 10 });
  });
});

describe('correlation ids from any format', () => {
  const entry = (raw: string, metadata?: Record<string, unknown>): LogEntry => ({ timestamp: null, level: 'INFO', message: raw, raw, lineNumber: 1, metadata });

  it('W3C traceparent in text', () => {
    const e = entry('GET /x traceparent=00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    enrichCorrelation(e);
    expect(e.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(e.parentSpanId).toBe('00f067aa0ba902b7');
  });

  it('nested structured fields and header-style keys', () => {
    const e = entry('x', { trace: { id: '4BF92F3577B34DA6A3CE929D0E0E4736' }, 'x-request-id': 'req-77', span: { id: '00f067aa0ba902b7' } });
    enrichCorrelation(e);
    expect(e.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(e.spanId).toBe('00f067aa0ba902b7');
    expect(e.requestId).toBe('req-77');
  });

  it('Sleuth MDC and key=value text; all-zero ids are ignored', () => {
    const e = entry('INFO [shop,4bf92f3577b34da6a3ce929d0e0e4736,00f067aa0ba902b7] handled request_id=abc-1');
    enrichCorrelation(e);
    expect(e.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(e.requestId).toBe('abc-1');
    const z = entry('x', { trace_id: '00000000000000000000000000000000' });
    enrichCorrelation(z);
    expect(z.traceId).toBeUndefined();
  });

  it('trace_timeline builds a span tree across services', async () => {
    const T = '4bf92f3577b34da6a3ce929d0e0e4736';
    const gw = [
      { time: '2024-12-13T10:00:00.000Z', level: 'info', msg: 'request in', service: 'gateway', trace_id: T, span_id: 'aaaaaaaaaaaaaaaa' },
      { time: '2024-12-13T10:00:00.400Z', level: 'info', msg: 'request out', service: 'gateway', trace_id: T, span_id: 'aaaaaaaaaaaaaaaa' },
      { time: '2024-12-13T10:00:00.050Z', level: 'info', msg: 'other trace', service: 'gateway', trace_id: '11111111111111111111111111111111', span_id: 'cccccccccccccccc' },
    ];
    const orders = [
      { time: '2024-12-13T10:00:00.100Z', level: 'info', msg: 'load order', service: 'orders', trace_id: T, span_id: 'bbbbbbbbbbbbbbbb', parent_span_id: 'aaaaaaaaaaaaaaaa' },
      { time: '2024-12-13T10:00:00.300Z', level: 'error', msg: 'db timeout', service: 'orders', trace_id: T, span_id: 'bbbbbbbbbbbbbbbb', parent_span_id: 'aaaaaaaaaaaaaaaa' },
    ];
    const dir = writeFixtures({
      'gw.log': gw.map((o) => JSON.stringify(o)).join('\n') + '\n',
      'orders.log': orders.map((o) => JSON.stringify(o)).join('\n') + '\n',
    });
    const r = await call('trace_timeline', { filePaths: [join(dir, 'gw.log'), join(dir, 'orders.log')], id: T.toUpperCase() });
    expect(r.entries).toBe(4);
    expect(r.timeline.map((e: any) => e.message)).toEqual(['request in', 'load order', 'db timeout', 'request out']);
    expect(r.timeline.map((e: any) => e.offsetMs)).toEqual([0, 100, 300, 400]);
    expect(r.spanTree.linkedByParent).toBe(true);
    expect(r.spanTree.roots).toHaveLength(1);
    expect(r.spanTree.roots[0].children[0]).toMatchObject({ spanId: 'bbbbbbbbbbbbbbbb', errors: 1, services: ['orders'] });
    expect(r.services.map((s: any) => s.name).sort()).toEqual(['gateway', 'orders']);
  });

  it('correlate_events chains logfmt entries by traceId', async () => {
    const dir = writeFixtures({ 'a.log': LOGFMT });
    const r = await call('correlate_events', { filePath: join(dir, 'a.log'), correlationField: 'traceId' });
    expect(r.totalChains).toBe(1);
    expect(r.chains[0].correlationValue).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('correlate_events with a custom dotted field', async () => {
    const lines = [{ msg: 'a', ctx: { order: 7 } }, { msg: 'b', ctx: { order: 7 } }, { msg: 'c', ctx: { order: 8 } }].map((o) => JSON.stringify(o)).join('\n') + '\n';
    const dir = writeFixtures({ 'a.log': lines });
    const r = await call('correlate_events', { filePath: join(dir, 'a.log'), correlationField: 'custom', customField: 'ctx.order' });
    expect(r.chains[0]).toMatchObject({ correlationValue: '7', eventCount: 2 });
  });
});

describe('access_log_stats', () => {
  it('computes status classes, latency percentiles per endpoint and top lists', async () => {
    const dir = writeFixtures({ 'access.log': NGINX });
    const r = await call('access_log_stats', { filePath: join(dir, 'access.log'), bucket: '1m' });
    expect(r.requests).toBe(5);
    expect(r.statusClasses).toMatchObject({ '2xx': 3, '4xx': 1, '5xx': 1 });
    expect(r.errorRate).toEqual({ server5xxPercent: 20, client4xxPercent: 20 });
    expect(r.slowestEndpoints[0]).toMatchObject({ endpoint: 'POST /api/orders', requests: 2, p50: 900, errorRate5xx: 50 });
    expect(r.busiestEndpoints[0]).toMatchObject({ endpoint: 'GET /api/users/{id}', requests: 3 });
    expect(r.topIps[0]).toEqual({ ip: '10.0.0.1', count: 3 });
    expect(r.errorRateOverTime.series.find((b: any) => b.errors5xx === 1).time).toBe('2024-12-13T10:31:00.000Z');
  });

  it('says so when there is no latency field instead of reporting zeros', async () => {
    const dir = writeFixtures({ 'clf.log': '127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.0" 200 2326\n' });
    const r = await call('access_log_stats', { filePath: join(dir, 'clf.log') });
    expect(r.latencyMs).toBeNull();
    expect(r.latencyNote).toMatch(/No latency field/);
  });

  it('reports "no HTTP requests" for a non-access log', async () => {
    const dir = writeFixtures({ 'app.log': '2024-12-13 10:00:00,000 - app - INFO - hi\n' });
    const r = await call('access_log_stats', { filePath: join(dir, 'app.log') });
    expect(r.requests).toBe(0);
    expect(r.error).toMatch(/No HTTP request entries/);
  });
});
