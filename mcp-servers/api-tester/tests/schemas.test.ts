// SPDX-License-Identifier: MIT
/**
 * The real input schemas (the old file tested a hand-copied replica, which
 * could drift from what the handlers parse) and the ListTools view of them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { schemas, handlers, toInputSchema } from '../src/handlers/index.js';
import { fixture } from './helpers.js';

const { http_request: HttpRequestSchema, health_check: HealthCheckSchema, batch_request: BatchRequestSchema } = schemas;

describe('http_request schema', () => {
  it('accepts a simple GET', () => {
    expect(HttpRequestSchema.safeParse({ method: 'GET', url: 'https://api.example.com/users' }).success).toBe(true);
  });

  it('accepts templated URLs (validated after substitution)', () => {
    expect(HttpRequestSchema.safeParse({ method: 'GET', url: '{{baseUrl}}/users' }).success).toBe(true);
  });

  it('rejects an unknown method and an unknown bodyType', () => {
    expect(HttpRequestSchema.safeParse({ method: 'INVALID', url: 'https://x' }).success).toBe(false);
    expect(HttpRequestSchema.safeParse({ method: 'POST', url: 'https://x', bodyType: 'xml' }).success).toBe(false);
  });

  it('bounds the timeout', () => {
    expect(HttpRequestSchema.safeParse({ method: 'GET', url: 'https://x', timeout: 10_000_000 }).success).toBe(false);
  });

  it('accepts auth, assertions and multipart files', () => {
    const r = HttpRequestSchema.safeParse({
      method: 'POST',
      url: 'https://x',
      bodyType: 'multipart',
      body: { a: '1' },
      files: [{ field: 'f', path: 'a.txt' }],
      auth: { type: 'oauth2', grant: 'client_credentials', tokenUrl: 'https://t', clientId: 'c' },
      assert: [{ target: 'jsonpath', path: '$.id', op: 'exists' }],
    });
    expect(r.success).toBe(true);
  });
});

describe('health_check and batch_request schemas', () => {
  it('health_check takes endpoints', () => {
    expect(HealthCheckSchema.parse({ url: 'https://x', endpoints: ['/a'] }).endpoints).toEqual(['/a']);
  });

  it('batch defaults sequential to false and accepts HEAD/OPTIONS + timeout', () => {
    const r = BatchRequestSchema.parse({
      requests: [
        { name: 'h', method: 'HEAD', url: 'https://x', timeout: 1000 },
        { name: 'o', method: 'OPTIONS', url: 'https://x' },
      ],
    });
    expect(r.sequential).toBe(false);
  });

  it('caps the batch size', () => {
    const requests = Array.from({ length: 201 }, (_, i) => ({ name: String(i), method: 'GET', url: 'https://x' }));
    expect(BatchRequestSchema.safeParse({ requests }).success).toBe(false);
  });
});

describe('ListTools view', () => {
  it('produces an object JSON Schema for every tool, with required fields', () => {
    for (const [name, schema] of Object.entries(schemas)) {
      const js = toInputSchema(schema);
      expect(js.type, name).toBe('object');
      expect(js.$schema, name).toBeUndefined();
    }
    expect(toInputSchema(schemas.http_request).required).toEqual(['method', 'url']);
    // Defaults do not make a field required on input.
    expect(toInputSchema(schemas.batch_request).required).toEqual(['requests']);
  });

  it('every schema has a handler and metadata.json lists exactly these tools', () => {
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(schemas).sort());
    const meta = JSON.parse(readFileSync(fixture('..', 'metadata.json'), 'utf8'));
    expect([...meta.tools].sort()).toEqual(Object.keys(schemas).sort());
  });
});
