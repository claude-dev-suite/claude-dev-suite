// SPDX-License-Identifier: MIT
/** OpenAPI loading, normalisation, sampling and validation across Swagger 2, OAS 3.0 and 3.1. */

import { describe, it, expect } from 'vitest';
import { loadModel, loadSpecFromObject, buildModel, generateSample, validateAgainst, toJsonSchema, findOperation } from '../src/spec/index.js';
import { fixture } from './helpers.js';

describe('Swagger 2.0 normalisation (old generators ignored it)', async () => {
  const model = await loadModel(fixture('swagger2-petstore.json'));

  it('builds servers from schemes/host/basePath', () => {
    expect(model.dialect).toBe('swagger-2.0');
    expect(model.servers).toEqual(['https://petstore.example.com/api']);
  });

  it('turns the body parameter into a request body', () => {
    const op = model.operations.find((o) => o.operationId === 'createPet')!;
    expect(op.requestBody?.required).toBe(true);
    expect(Object.keys(op.requestBody!.content)).toEqual(['application/json']);
    expect(generateSample(op.requestBody!.content['application/json'].schema, { mode: 'request' })).toEqual({ name: 'string', tag: 'string', age: 0 });
  });

  it('turns formData parameters into a multipart body', () => {
    const op = model.operations.find((o) => o.operationId === 'uploadPhoto')!;
    expect(Object.keys(op.requestBody!.content)).toEqual(['multipart/form-data']);
    expect(op.requestBody!.content['multipart/form-data'].schema).toMatchObject({ required: ['caption'] });
  });

  it('reads responses.schema and examples, and merges path-level parameters', () => {
    const op = model.operations.find((o) => o.operationId === 'getPet')!;
    expect(op.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(['path:petId']);
    expect(op.responses['200'].content['application/json'].example).toEqual({ id: 7, name: 'Rex', tag: 'dog' });
    expect(op.responses['200'].content['application/json'].schema).toBeDefined();
  });

  it('maps security definitions', () => {
    expect(model.securitySchemes.basicAuth).toEqual({ type: 'http', scheme: 'basic' });
    expect(model.securitySchemes.api_key).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-API-Key' });
  });

  it('validates x-nullable and allOf', () => {
    const pet = model.operations.find((o) => o.operationId === 'getPet')!.responses['200'].content['application/json'].schema;
    expect(validateAgainst(pet, { id: 1, name: 'a', tag: null }, model.dialect).valid).toBe(true);
    const bad = validateAgainst(pet, { name: 'a' }, model.dialect);
    expect(bad.valid).toBe(false);
    expect(bad.errors[0].message).toMatch(/id/);
  });
});

describe('recursive schemas (old code: stack overflow)', async () => {
  const model = await loadModel(fixture('swagger2-petstore.json'));
  const schema = model.operations.find((o) => o.operationId === 'listCategories')!.responses['200'].content['application/json'].schema;

  it('generates a finite sample', () => {
    const s = generateSample(schema) as Record<string, unknown>;
    expect(s.name).toBe('string');
    expect(Array.isArray(s.children)).toBe(true);
  });

  it('converts the cycle into $ref definitions Ajv can compile', () => {
    const js = toJsonSchema(schema, model.dialect);
    expect(JSON.stringify(js)).toContain('#/definitions/');
    const ok = validateAgainst(schema, { name: 'root', children: [{ name: 'leaf', children: [] }] }, model.dialect);
    expect(ok.valid).toBe(true);
    const bad = validateAgainst(schema, { name: 'root', children: [{ children: [] }] }, model.dialect);
    expect(bad.valid).toBe(false);
  });
});

describe('OpenAPI 3.1 with external $ref, oneOf and type arrays', async () => {
  const model = await loadModel(fixture('oas31-shop.yaml'));

  it('resolves refs into another file', () => {
    const op = model.operations.find((o) => o.operationId === 'createOrder')!;
    const schema = op.requestBody!.content['application/json'].schema!;
    expect(schema.required).toEqual(['total', 'items']);
    expect(model.warnings).toEqual([]);
  });

  it('samples allOf + oneOf + 3.1 exclusiveMinimum', () => {
    const op = model.operations.find((o) => o.operationId === 'getOrder')!;
    const schema = op.responses['200'].content['application/json'].schema;
    const sample = generateSample(schema, { mode: 'response' }) as Record<string, unknown>;
    expect(sample).toMatchObject({ id: 1, status: 'new', payment: { kind: 'card' } });
    expect(sample.total as number).toBeGreaterThan(0);
    expect(validateAgainst(schema, sample, model.dialect).valid).toBe(true);
  });

  it('validates with JSON Schema 2020-12 semantics (type arrays, const, oneOf)', () => {
    const schema = model.operations.find((o) => o.operationId === 'getOrder')!.responses['200'].content['application/json'].schema;
    const base = { id: 1, status: 'paid', total: 1, items: [{ sku: 'a', qty: 1 }] };
    expect(validateAgainst(schema, { ...base, note: null, payment: { kind: 'transfer', iban: 'X' } }, model.dialect).valid).toBe(true);
    const r = validateAgainst(schema, { ...base, payment: { kind: 'cash' } }, model.dialect);
    expect(r.valid).toBe(false);
    expect(validateAgainst(schema, { ...base, total: 0 }, model.dialect).valid).toBe(false);
  });

  it('matches concrete paths to templates', () => {
    expect(findOperation(model, 'GET', '/orders/42')?.params).toEqual({ id: '42' });
    expect(findOperation(model, 'DELETE', '/orders/42')).toBeUndefined();
  });
});

describe('OpenAPI 3.0 specifics', () => {
  it('handles nullable and boolean exclusiveMinimum', async () => {
    const loaded = await loadSpecFromObject({
      openapi: '3.0.3',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        n: { type: 'number', minimum: 0, exclusiveMinimum: true },
                        s: { type: 'string', nullable: true, enum: ['a'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const model = buildModel(loaded);
    const schema = model.operations[0].responses['200'].content['application/json'].schema;
    expect(validateAgainst(schema, { n: 1, s: null }, 'openapi-3.0').valid).toBe(true);
    expect(validateAgainst(schema, { n: 0 }, 'openapi-3.0').valid).toBe(false);
    expect(validateAgainst(schema, { n: 1, s: 'b' }, 'openapi-3.0').valid).toBe(false);
  });

  it('reports an unresolvable $ref as a warning instead of crashing', async () => {
    const loaded = await loadSpecFromObject({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: { '/x': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Nope' } } } } } } } },
    });
    expect(loaded.warnings.join()).toMatch(/Unresolvable \$ref "#\/components\/schemas\/Nope"/);
  });

  it('rejects a document that is not OpenAPI', async () => {
    const loaded = await loadSpecFromObject({ hello: 'world' });
    expect(() => buildModel(loaded)).toThrow(/Not an OpenAPI/);
  });
});
