// SPDX-License-Identifier: MIT
/** JSONPath evaluator, variable substitution, cookie jar, redaction. */

import { describe, it, expect } from 'vitest';
import { query, queryAll } from '../src/assertions/jsonpath.js';
import { substituteString, substituteDeep, referencedVariables } from '../src/vars/substitute.js';
import { CookieJar } from '../src/http/cookies.js';
import { Redactor, maskHeaders } from '../src/util/redact.js';
import { encodeBody } from '../src/http/body.js';
import { SseParser, type SseEvent } from '../src/realtime/sse.js';

const doc = {
  store: {
    book: [
      { title: 'A', price: 8, tags: ['x'] },
      { title: 'B', price: 12, isbn: '1' },
      { title: 'C', price: 30, isbn: '2' },
    ],
    bicycle: { color: 'red', price: 20 },
  },
  'odd key': 1,
};

describe('jsonpath', () => {
  it.each([
    ['$.store.bicycle.color', 'red'],
    ['store.bicycle.color', 'red'],
    ["$['odd key']", 1],
    ['$.store.book[-1].title', 'C'],
    ['$.store.book[0].tags[0]', 'x'],
  ])('definite path %s', (path, expected) => {
    expect(query(doc, path)).toMatchObject({ found: true, value: expected, definite: true });
  });

  it.each([
    ['$.store.book[*].title', ['A', 'B', 'C']],
    ['$..price', [8, 12, 30, 20]],
    ['$.store.book[0:2].title', ['A', 'B']],
    ['$.store.book[::-1].title', ['C', 'B', 'A']],
    ['$.store.book[0,2].title', ['A', 'C']],
    ['$.store.book[?(@.price < 10)].title', ['A']],
    ['$.store.book[?(@.isbn)].title', ['B', 'C']],
    ["$.store.book[?(@.title == 'B' || @.price > 25)].title", ['B', 'C']],
    ['$.store.book[?(@.title =~ /^[AB]$/)].price', [8, 12]],
    ['$.store.*.color', ['red']],
  ])('query %s', (path, expected) => {
    expect(queryAll(doc, path)).toEqual(expected);
  });

  it('distinguishes absent from null', () => {
    expect(query({ a: null }, '$.a')).toMatchObject({ found: true, value: null });
    expect(query({ a: null }, '$.b')).toMatchObject({ found: false });
  });

  it('rejects malformed paths', () => {
    expect(() => query(doc, '$.store[')).toThrow();
  });
});

describe('variables', () => {
  it('substitutes nested variables, Insomnia _. syntax and dotted lookups', () => {
    const r = substituteString('{{url}}/{{ _.v }}/{{user.id}}', { url: '{{host}}:{{port}}', host: 'h', port: 1, v: 'x', user: { id: 9 } });
    expect(r.value).toBe('h:1/x/9');
    expect(r.missing).toEqual([]);
  });

  it('reports missing variables and unknown dynamic ones', () => {
    const r = substituteString('{{a}} {{$nope}} {{b}}', { b: 2 });
    expect(r.value).toBe('{{a}} {{$nope}} 2');
    expect(r.missing.sort()).toEqual(['$nope', 'a']);
  });

  it('produces dynamic values', () => {
    const r = substituteString('{{$uuid}}|{{$timestamp}}|{{$randomInt 3 4}}|{{$isoTimestamp}}|{{$randomString 5}}', {});
    const [uuid, ts, n, iso, str] = r.value.split('|');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    expect(Number(ts)).toBeGreaterThan(1_600_000_000);
    expect(n).toBe('3');
    expect(new Date(iso).toISOString()).toBe(iso);
    expect(str).toHaveLength(5);
  });

  it('preserves types for exact placeholders only when asked', () => {
    expect(substituteDeep({ v: '{{n}}' }, { n: 7 }, { preserveTypes: true }).value).toEqual({ v: 7 });
    expect(substituteDeep({ v: '{{n}}' }, { n: 7 }).value).toEqual({ v: '7' });
  });

  it('lists referenced variables', () => {
    expect(referencedVariables({ a: ['{{x}}', { '{{y}}': '{{$uuid}}' }] }).sort()).toEqual(['x', 'y']);
  });
});

describe('cookie jar', () => {
  const u = (s: string) => new URL(s);
  it('matches domain, path, secure and expiry', () => {
    const jar = new CookieJar();
    jar.store(u('https://api.example.com/v1/login'), [
      'a=1; Path=/',
      'b=2; Domain=example.com; Path=/v1',
      'c=3; Secure',
      'd=4; Max-Age=0',
      'evil=5; Domain=other.com',
    ]);
    // Longer paths first (RFC 6265 5.4): b and c are scoped to /v1.
    expect(jar.header(u('https://api.example.com/v1/x'))).toBe('b=2; c=3; a=1');
    expect(jar.header(u('https://www.example.com/v1/x'))).toBe('b=2');
    expect(jar.header(u('http://api.example.com/'))).toBe('a=1');
    expect(jar.list().map((c) => c.name).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('redaction', () => {
  it('scrubs registered secrets and URL passwords everywhere', () => {
    const r = new Redactor();
    r.add('s3cr3t-value');
    expect(r.scrub({ a: 'x s3cr3t-value y', b: ['https://u:pw@host/'] })).toEqual({ a: 'x *** y', b: ['https://u:***@host/'] });
  });

  it('masks sensitive headers but keeps the auth scheme and cookie names', () => {
    expect(maskHeaders({ Authorization: 'Bearer abc', 'Set-Cookie': 'sid=1; Path=/', Accept: 'x' })).toEqual({
      Authorization: 'Bearer ***',
      'Set-Cookie': 'sid=***; Path=/',
      Accept: 'x',
    });
  });
});

describe('body encoding', () => {
  it('auto: JSON-looking strings get application/json, others text/plain', async () => {
    expect((await encodeBody({ body: '{"a":1}' })).contentType).toBe('application/json');
    expect((await encodeBody({ body: 'hello' })).contentType).toBe('text/plain; charset=utf-8');
    expect((await encodeBody({ body: null })).data?.toString()).toBe('null');
    expect((await encodeBody({})).kind).toBe('none');
  });
});

describe('SSE parser', () => {
  it('handles multi-line data, ids, comments, retry and CRLF split across chunks', () => {
    const events: SseEvent[] = [];
    const p = new SseParser((e) => events.push(e));
    p.push(': keep-alive\r\nevent: update\r\nid: 1\r\ndata: {"a":\r');
    p.push('\ndata: 1}\r\n\r\ndata: plain\n\nretry: 5000\nevent: ignored-without-data\n\n');
    expect(events.map(({ at, ...e }) => e)).toEqual([
      { event: 'update', id: '1', data: '{"a":\n1}', json: { a: 1 } },
      { event: 'message', id: '1', data: 'plain' },
    ]);
  });
});
