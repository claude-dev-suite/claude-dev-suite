// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { call } from './helpers.js';
import { writeFixtures, NGINX } from './fixtures.js';
import { parseQuery } from '../src/analyzers/query.js';

const JSONL = [
  { time: '2024-12-13T10:00:05Z', level: 'info', msg: 'req', service: 'api', path: '/a', latency_ms: 10, user: 'u1' },
  { time: '2024-12-13T10:00:30Z', level: 'error', msg: 'req failed timeout', service: 'api', path: '/a', latency_ms: 900, user: 'u2' },
  { time: '2024-12-13T10:01:10Z', level: 'warn', msg: 'slow', service: 'worker', path: '/b', latency_ms: 300, user: 'u1' },
  { time: '2024-12-13T10:02:10Z', level: 'error', msg: 'db down', service: 'worker', path: '/b', latency_ms: 50, user: 'u3' },
  { time: '2024-12-13T10:02:50Z', level: 'info', msg: 'req', service: 'api', path: '/c', latency_ms: 20, http: { status: 200 } },
].map((o) => JSON.stringify(o)).join('\n') + '\n';

const dir = writeFixtures({ 'app.jsonl': JSONL, 'access.log': NGINX });
const f = join(dir, 'app.jsonl');

describe('LogQL-lite parser', () => {
  it('parses filters and stages', () => {
    const q = parseQuery('level >= WARN and service = "api" and path =~ "^/a" and "timeout" and !"health" | count by (path, service) | top 5');
    expect(q.where).toEqual([
      { field: 'level', op: '>=', value: 'WARN' },
      { field: 'service', op: '=', value: 'api' },
      { field: 'path', op: '=~', value: '^/a' },
    ]);
    expect(q.text).toEqual(['timeout']);
    expect(q.notText).toEqual(['health']);
    expect(q.aggregate).toEqual({ op: 'count' });
    expect(q.groupBy).toEqual(['path', 'service']);
    expect(q.topK).toBe(5);
  });

  it('gives clear syntax errors', () => {
    expect(() => parseQuery('level >= ERROR or service = api')).toThrow(/or" is not supported/);
    expect(() => parseQuery('| frobnicate')).toThrow(/Unknown stage/);
    expect(() => parseQuery('path = "unterminated')).toThrow(/Unterminated/);
  });
});

describe('query_logs', () => {
  it('entries mode with level ordering and field filters', async () => {
    const r = await call('query_logs', { filePath: f, query: 'level >= WARN and service = worker' });
    expect(r.totalMatches).toBe(2);
    expect(r.entries.map((e: any) => e.message)).toEqual(['slow', 'db down']);
  });

  it('newest + limit, with truncated marker', async () => {
    const r = await call('query_logs', { filePath: f, query: 'exists(service) | newest | limit 2' });
    expect(r.entries.map((e: any) => e.message)).toEqual(['req', 'db down']);
    expect(r.truncated).toBe(true);
  });

  it('count by with top-k', async () => {
    const r = await call('query_logs', { filePath: f, query: '| count by (service) | top 1' });
    expect(r.rows).toEqual([{ group: { service: 'api' }, count: 3 }]);
    expect(r.groupsOmitted).toBe(1);
  });

  it('count_over_time buckets', async () => {
    const r = await call('query_logs', { filePath: f, query: 'level = error | count_over_time(1m)' });
    expect(r.rows).toEqual([
      { bucket: '2024-12-13T10:00:00.000Z', count: 1 },
      { bucket: '2024-12-13T10:02:00.000Z', count: 1 },
    ]);
  });

  it('percentiles, avg and count_distinct', async () => {
    const p = await call('query_logs', { filePath: f, query: 'service = api | percentiles(latency_ms, 50, 90)' });
    expect(p.rows[0]).toMatchObject({ count: 3, p50: 20, min: 10, max: 900 });
    const a = await call('query_logs', { filePath: f, query: '| avg(latency_ms) by (service)' });
    expect(a.rows.find((r: any) => r.group.service === 'worker').avg).toBe(175);
    const d = await call('query_logs', { filePath: f, query: '| count_distinct(user)' });
    expect(d.rows[0].distinct).toBe(3);
  });

  it('JSON query object: in, dotted paths, contains', async () => {
    const r = await call('query_logs', {
      filePath: f,
      where: [{ field: 'path', op: 'in', value: ['/b', '/c'] }, { field: 'msg', op: '!contains', value: 'slow' }],
    });
    expect(r.entries.map((e: any) => e.message)).toEqual(['db down', 'req']);
    const s = await call('query_logs', { filePath: f, where: [{ field: 'http.status', op: '=', value: 200 }] });
    expect(s.totalMatches).toBe(1);
  });

  it('works on access logs (status and durations are fields)', async () => {
    const r = await call('query_logs', { filePath: join(dir, 'access.log'), query: 'status >= 400 | count by (status)' });
    expect(r.rows).toEqual(expect.arrayContaining([{ group: { status: '500' }, count: 1 }, { group: { status: '404' }, count: 1 }]));
  });

  it('refuses a dangerous regex', async () => {
    await expect(call('query_logs', { filePath: f, query: 'msg =~ "(a+)+"' })).rejects.toThrow(/ReDoS/);
  });
});
