// SPDX-License-Identifier: MIT
/**
 * Behavioural tests for the request engine against a real local server.
 * Several pin defects of the old fetch-based client (noted per test).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';
import { handleHttpRequest, handleBatchRequest, handleHealthCheck } from '../src/handlers/api-tester-handlers.js';
import { startServer, json, tempProject, parseResult, type TestServer } from './helpers.js';
import { assertAddressAllowed } from '../src/http/ssrf-policy.js';
import { buildDigestHeader } from '../src/http/client.js';
import { clearTokenCache } from '../src/http/auth.js';

let srv: TestServer;
let project: string;
let tokenCalls = 0;

beforeAll(async () => {
  project = tempProject();
  process.env.API_TESTER_PROJECT_DIR = project;
  mkdirSync(join(project, 'files'));
  writeFileSync(join(project, 'files', 'hello.txt'), 'hello file');

  srv = await startServer(async (req, res, body) => {
    const url = new URL(req.url!, 'http://x');
    switch (url.pathname) {
      case '/echo':
        return json(res, 200, {
          method: req.method,
          contentType: req.headers['content-type'] ?? null,
          body: body.toString('utf8'),
          auth: req.headers.authorization ?? null,
          cookie: req.headers.cookie ?? null,
          query: Object.fromEntries(url.searchParams),
        });
      case '/stall':
        // Headers now, body never: the old client cleared its timeout on headers and hung.
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('partial');
        return;
      case '/big':
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('x'.repeat(200_000));
        return;
      case '/gzip':
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
        res.end(gzipSync(JSON.stringify({ zipped: true })));
        return;
      case '/redirect':
        res.writeHead(302, { Location: '/echo' });
        res.end();
        return;
      case '/redirect-cross':
        // 127.0.0.1 -> localhost is a different origin
        res.writeHead(307, { Location: `http://localhost:${srv.port}/echo` });
        res.end();
        return;
      case '/set-cookie':
        res.writeHead(200, { 'Set-Cookie': ['sid=abc123; Path=/; HttpOnly', 'pref=dark; Path=/'] });
        res.end('ok');
        return;
      case '/digest': {
        const h = String(req.headers.authorization ?? '');
        if (!h.startsWith('Digest ')) {
          res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="test", qop="auth", nonce="n0nce", opaque="op"' });
          res.end();
          return;
        }
        const p = Object.fromEntries([...h.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
        const H = (s: string) => createHash('md5').update(s).digest('hex');
        const expected = H(`${H('alice:test:wonder')}:n0nce:${p.nc}:${p.cnonce}:auth:${H(`GET:${p.uri}`)}`);
        return json(res, p.response === expected ? 200 : 403, { ok: p.response === expected });
      }
      case '/token': {
        tokenCalls++;
        const form = new URLSearchParams(body.toString());
        const basic = Buffer.from(String(req.headers.authorization ?? '').replace('Basic ', ''), 'base64').toString();
        if (form.get('grant_type') !== 'client_credentials' || basic !== 'cid:csecret') return json(res, 401, { error: 'invalid_client' });
        return json(res, 200, { access_token: `tok-${tokenCalls}-xyz`, token_type: 'bearer', expires_in: 3600 });
      }
      case '/html':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>hi</h1>');
        return;
      case '/health':
        return json(res, 200, { status: 'up' });
      default:
        return json(res, 404, { error: 'nf' });
    }
  });
});

afterAll(async () => {
  await srv.close();
  delete process.env.API_TESTER_PROJECT_DIR;
});

beforeEach(() => {
  srv.requests.length = 0;
});

const call = async (args: Record<string, unknown>) => parseResult(await handleHttpRequest(args));

describe('request bodies (old client forced JSON on everything)', () => {
  it('sends form-urlencoded as form, not JSON', async () => {
    const r = await call({ method: 'POST', url: `${srv.url}/echo`, body: { a: '1', b: ['x', 'y'] }, bodyType: 'form' });
    expect(r.response.body.contentType).toBe('application/x-www-form-urlencoded');
    expect(r.response.body.body).toBe('a=1&b=x&b=y');
  });

  it('sends a raw string verbatim with its own content type', async () => {
    const r = await call({ method: 'POST', url: `${srv.url}/echo`, body: '<a>1</a>', headers: { 'Content-Type': 'application/xml' } });
    expect(r.response.body.body).toBe('<a>1</a>');
    expect(r.response.body.contentType).toBe('application/xml');
  });

  it.each([[0], [false], ['']])('does not drop the falsy body %j', async (value) => {
    const r = await call({ method: 'POST', url: `${srv.url}/echo`, body: value, bodyType: typeof value === 'string' ? 'text' : 'json' });
    expect(r.response.body.body).toBe(typeof value === 'string' ? '' : JSON.stringify(value));
    if (typeof value !== 'string') expect(r.response.body.contentType).toBe('application/json');
  });

  it('does not add Content-Type to a GET without body', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/echo` });
    expect(r.response.body.contentType).toBeNull();
  });

  it('builds multipart with a project file', async () => {
    const r = await call({
      method: 'POST',
      url: `${srv.url}/echo`,
      bodyType: 'multipart',
      body: { title: 'doc' },
      files: [{ field: 'upload', path: 'files/hello.txt' }],
    });
    expect(r.response.body.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(r.response.body.body).toContain('name="title"\r\n\r\ndoc');
    expect(r.response.body.body).toContain('filename="hello.txt"');
    expect(r.response.body.body).toContain('hello file');
  });

  it('refuses to upload a file outside the project directory', async () => {
    const outside = join(tempProject(), 'secret.txt');
    writeFileSync(outside, 'secret');
    const res = await handleHttpRequest({ method: 'POST', url: `${srv.url}/echo`, bodyType: 'multipart', files: [{ field: 'f', path: outside }] });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/outside the project/);
    expect(srv.requests).toHaveLength(0);
  });

  it('sends base64 binary bodies', async () => {
    const r = await call({ method: 'PUT', url: `${srv.url}/echo`, bodyType: 'binary', body: Buffer.from('bin!').toString('base64') });
    expect(r.response.body.body).toBe('bin!');
    expect(r.response.body.contentType).toBe('application/octet-stream');
  });
});

describe('timeouts and size caps', () => {
  it('times out while the body is still streaming', async () => {
    const t0 = Date.now();
    const res = await handleHttpRequest({ method: 'GET', url: `${srv.url}/stall`, timeout: 400 });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/timed out/i);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('caps the response size and says so', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/big`, maxResponseBytes: 1000 });
    expect(r.response.size).toBe(1000);
    expect(r.response.sizeCapped).toBe(true);
  });

  it('truncates the returned body with an explicit marker', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/big`, maxBodyChars: 100 });
    expect(r.response.body).toHaveLength(100);
    expect(r.response.bodyTruncated).toBe(true);
  });

  it('decompresses gzip', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/gzip` });
    expect(r.response.body).toEqual({ zipped: true });
  });
});

describe('redirects, cookies, auth', () => {
  it('follows redirects by default and reports the chain', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/redirect` });
    expect(r.response.status).toBe(200);
    expect(r.response.redirects).toHaveLength(1);
  });

  it('returns the 3xx itself with followRedirects manual', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/redirect`, followRedirects: 'manual' });
    expect(r.response.status).toBe(302);
  });

  it('errors with followRedirects error', async () => {
    const res = await handleHttpRequest({ method: 'GET', url: `${srv.url}/redirect`, followRedirects: 'error' });
    expect(res.isError).toBe(true);
  });

  it('drops Authorization on a cross-origin redirect', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/redirect-cross`, auth: { type: 'bearer', token: 'tok-should-not-leak' } });
    expect(r.response.status).toBe(200);
    expect(r.response.body.auth).toBeNull();
  });

  it('keeps cookies in a named session across calls', async () => {
    await call({ method: 'GET', url: `${srv.url}/set-cookie`, session: 's1' });
    const r = await call({ method: 'GET', url: `${srv.url}/echo`, session: 's1' });
    expect(r.response.body.cookie).toContain('sid=abc123');
    const other = await call({ method: 'GET', url: `${srv.url}/echo`, session: 's2' });
    expect(other.response.body.cookie).toBeNull();
  });

  it('applies basic auth and redacts it (and its echo) from the output', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/echo`, auth: { type: 'basic', username: 'u', password: 'p4ssw0rd!' } });
    const b64 = Buffer.from('u:p4ssw0rd!').toString('base64');
    expect(srv.requests[0].headers.authorization).toBe(`Basic ${b64}`);
    expect(JSON.stringify(r)).not.toContain(b64);
    expect(r.request.headers.Authorization).toBe('Basic ***');
  });

  it('puts an API key in the query and masks it in the echo', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/echo`, auth: { type: 'apiKey', in: 'query', name: 'api_key', value: 'k-123456' } });
    expect(srv.requests[0].url).toContain('api_key=k-123456');
    expect(JSON.stringify(r)).not.toContain('k-123456');
  });

  it('answers a digest challenge', async () => {
    const r = await call({ method: 'GET', url: `${srv.url}/digest`, auth: { type: 'digest', username: 'alice', password: 'wonder' } });
    expect(r.response.status).toBe(200);
    expect(r.response.body.ok).toBe(true);
  });

  it('fetches and caches an OAuth2 client-credentials token', async () => {
    clearTokenCache();
    tokenCalls = 0;
    const auth = { type: 'oauth2', grant: 'client_credentials', tokenUrl: `${srv.url}/token`, clientId: 'cid', clientSecret: 'csecret' };
    const a = await call({ method: 'GET', url: `${srv.url}/echo`, auth });
    const b = await call({ method: 'GET', url: `${srv.url}/echo`, auth });
    expect(tokenCalls).toBe(1);
    expect(srv.requests.filter((r) => r.url === '/echo').map((r) => r.headers.authorization)).toEqual(['Bearer tok-1-xyz', 'Bearer tok-1-xyz']);
    expect(JSON.stringify([a, b])).not.toContain('tok-1-xyz');
    expect(a.request.auth).toMatch(/new token/);
    expect(b.request.auth).toMatch(/cached token/);
  });

  it('reports a failed token request as an error, not a 401 from the API', async () => {
    clearTokenCache();
    const res = await handleHttpRequest({
      method: 'GET',
      url: `${srv.url}/echo`,
      auth: { type: 'oauth2', tokenUrl: `${srv.url}/token`, clientId: 'cid', clientSecret: 'wrong' },
    });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/OAuth2 token request .* failed: HTTP 401 — invalid_client/);
  });
});

describe('variables', () => {
  it('substitutes variables and dynamic values before validating the URL', async () => {
    const r = await call({
      method: 'POST',
      url: '{{base}}/echo',
      query: { id: '{{$uuid}}' },
      body: { n: '{{$randomInt 5 6}}' },
      variables: { base: srv.url },
      environment: 'none',
    });
    expect(r.response.status).toBe(200);
    expect(r.response.body.query.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(r.response.body.body)).toEqual({ n: '5' });
  });

  it('names unresolved variables instead of failing URL validation', async () => {
    const res = await handleHttpRequest({ method: 'GET', url: '{{baseUrl}}/x', environment: 'none' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/Unresolved variable: \{\{baseUrl\}\}/);
  });
});

describe('assertions', () => {
  it('evaluates status, header, jsonpath, time and schema assertions', async () => {
    const r = await call({
      method: 'GET',
      url: `${srv.url}/health`,
      assert: [
        { target: 'status', value: 200 },
        { target: 'header', path: 'content-type', op: 'contains', value: 'json' },
        { target: 'jsonpath', path: '$.status', value: 'up' },
        { target: 'jsonpath', path: '$.missing', op: 'notExists' },
        { target: 'responseTime', value: 5000 },
        { target: 'jsonSchema', schema: { type: 'object', required: ['status'], properties: { status: { enum: ['up'] } } } },
        { target: 'jsonpath', path: '$.status', value: 'down', name: 'intentional failure' },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.assertions.filter((a: { passed: boolean }) => !a.passed).map((a: { name: string }) => a.name)).toEqual(['intentional failure']);
  });
});

describe('batch_request (old schema lacked HEAD/OPTIONS and timeout)', () => {
  it('accepts HEAD, OPTIONS and per-request timeout', async () => {
    const res = parseResult(
      await handleBatchRequest({
        requests: [
          { name: 'head', method: 'HEAD', url: `${srv.url}/health` },
          { name: 'options', method: 'OPTIONS', url: `${srv.url}/health` },
          { name: 'slow', method: 'GET', url: `${srv.url}/stall`, timeout: 300 },
        ],
      })
    );
    expect(res.results.map((r: { status: number }) => r.status)).toEqual([200, 200, 0]);
    expect(res.results[2].error).toMatch(/timed out/);
    expect(res.summary).toMatchObject({ total: 3, successful: 2, failed: 1 });
  });

  it('stops a sequential batch on the first failure when asked', async () => {
    const res = parseResult(
      await handleBatchRequest({
        sequential: true,
        stopOnFailure: true,
        requests: [
          { name: 'a', method: 'GET', url: `${srv.url}/nope` },
          { name: 'b', method: 'GET', url: `${srv.url}/health` },
        ],
      })
    );
    expect(res.results[1]).toMatchObject({ name: 'b', skipped: true });
  });
});

describe('health_check', () => {
  it('reports healthy and unhealthy endpoints on a 127.0.0.1 service', async () => {
    const res = parseResult(await handleHealthCheck({ url: srv.url, endpoints: ['/health', '/missing'] }));
    expect(res.summary).toMatchObject({ total: 2, healthy: 1, unhealthy: 1 });
  });
});

describe('connect-time SSRF check (DNS rebinding)', () => {
  it('rejects a hostname that resolves to the metadata range', async () => {
    await expect(assertAddressAllowed('169.254.169.254', 'rebind.example')).rejects.toThrow(/metadata/);
  });
  it('rejects a private address without the opt-in and allows loopback', async () => {
    delete process.env.API_TESTER_ALLOW_PRIVATE;
    await expect(assertAddressAllowed('10.1.2.3', 'x')).rejects.toThrow(/API_TESTER_ALLOW_PRIVATE/);
    await expect(assertAddressAllowed('127.0.0.1', 'localhost')).resolves.toBeUndefined();
  });
});

describe('digest header', () => {
  it('computes an RFC 7616 MD5 response', () => {
    const h = buildDigestHeader('Digest realm="r", nonce="n", qop="auth"', { username: 'u', password: 'p' }, 'GET', '/x', 'c', '00000001')!;
    const H = (s: string) => createHash('md5').update(s).digest('hex');
    expect(h).toContain(`response="${H(`${H('u:r:p')}:n:00000001:c:auth:${H('GET:/x')}`)}"`);
  });
});
