// SPDX-License-Identifier: MIT
/** generate_tests: Swagger 2 + OAS 3.x, negative cases, schema assertions, every output format. */

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { handleGenerateTests } from '../src/handlers/api-tester-handlers.js';
import { fixture, parseResult, tempProject } from './helpers.js';

const gen = async (args: Record<string, unknown>) => parseResult(await handleGenerateTests(args));

describe('generate_tests on Swagger 2.0 (old: body params, host/basePath ignored)', async () => {
  const r = await gen({ specPath: fixture('swagger2-petstore.json') });

  it('uses host + basePath as the base URL', () => {
    expect(r.baseUrl).toBe('https://petstore.example.com/api');
    expect(r.tests[0].url.startsWith('https://petstore.example.com/api/')).toBe(true);
  });

  it('builds the body from the body parameter', () => {
    const t = r.tests.find((x: { operationId: string; kind: string }) => x.operationId === 'createPet' && x.kind === 'happy');
    expect(t.body).toEqual({ name: 'string', tag: 'string', age: 0 });
    expect(t.expectedStatus).toEqual([201]);
    expect(t.responseSchema).toBeDefined();
  });

  it('generates the negative cases', () => {
    const kinds = r.tests.filter((x: { operationId: string }) => x.operationId === 'createPet').map((x: { kind: string }) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['missing-required-field', 'wrong-field-type', 'missing-body', 'missing-auth']));
    const missingParam = r.tests.find((x: { operationId: string; kind: string }) => x.operationId === 'listPets' && x.kind === 'missing-required-param');
    expect(missingParam.query).toEqual({});
    const wrongPath = r.tests.find((x: { operationId: string; kind: string }) => x.operationId === 'getPet' && x.kind === 'wrong-path-param-type');
    expect(wrongPath.url).toContain('/pets/not-a-number');
  });

  it('survives the recursive Category schema', () => {
    expect(r.tests.some((x: { operationId: string }) => x.operationId === 'listCategories')).toBe(true);
  });

  it('exposes batch requests with credentials as placeholders', () => {
    const b = r.batchRequests.find((x: { name: string }) => x.name === 'createPet — happy path');
    expect(b.headers['X-API-Key']).toBe('{{apiKey}}');
  });
});

describe('code outputs', () => {
  it('vitest: imports vitest + ajv and validates the body schema', async () => {
    const r = await gen({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'vitest' });
    expect(r.code).toContain(`import { describe, it, expect } from 'vitest';`);
    expect(r.code).toContain(`import Ajv from 'ajv';`);
    expect(r.code).toMatch(/expectSchema\(SCHEMA_\d+, res\.data\)/);
    expect(r.requires).toEqual(['vitest', 'ajv']);
  });

  it('jest: CommonJS requires, no ESM import', async () => {
    const r = await gen({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'jest' });
    expect(r.code).toContain(`const { describe, it, expect } = require('@jest/globals');`);
    expect(r.code).toContain(`require('ajv').default`);
    expect(r.code).not.toMatch(/^import /m);
  });

  it('jest/vitest for OAS 3.1 use the 2020-12 Ajv build', async () => {
    const r = await gen({ specPath: fixture('oas31-shop.yaml'), outputFormat: 'vitest', baseUrl: 'http://localhost:9' });
    expect(r.code).toContain(`import Ajv from 'ajv/dist/2020.js';`);
  });

  it('pytest: httpx client + jsonschema validation', async () => {
    const r = await gen({ specPath: fixture('swagger2-petstore.json'), outputFormat: 'pytest' });
    expect(r.code).toContain('import httpx');
    expect(r.code).toContain('from jsonschema import Draft7Validator');
    expect(r.code).toMatch(/def test_createpet_happy\(client\):/);
    expect(r.code).toContain('assert_schema(SCHEMA_');
    expect(r.code).toContain('"X-API-Key"');
    expect(r.code).not.toContain('true,'); // Python literals, not JSON
  });

  it('http: REST Client format with expectations', async () => {
    const r = await gen({ specPath: fixture('swagger2-petstore.json'), outputFormat: 'http', includeNegativeTests: false });
    expect(r.code).toContain('@baseUrl = https://petstore.example.com/api');
    expect(r.code).toMatch(/### createPet — happy path\n# expect: 201/);
    expect(r.code).toContain('X-API-Key: {{apiKey}}');
  });

  it('scenario: runnable document with openapi assertions', async () => {
    const r = await gen({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'scenario' });
    expect(r.scenario.stopOnFailure).toBe(false);
    const happy = r.scenario.steps.find((s: { name: string }) => s.name === 'listTodos — happy path');
    expect(happy.assert.map((a: { target: string }) => a.target)).toEqual(['status', 'header', 'openapi']);
  });

  it('curl: shell-quoted and uses env credentials', async () => {
    const r = await gen({ specPath: fixture('swagger2-petstore.json'), outputFormat: 'curl', operations: ['uploadPhoto'] });
    expect(r.code).toContain('-u "$API_USERNAME:$API_PASSWORD"');
    expect(r.code).toContain("-F 'caption=string'");
  });

  it('writes to a project file and refuses to overwrite without the flag', async () => {
    const project = tempProject();
    process.env.API_TESTER_PROJECT_DIR = project;
    try {
      const out = join(project, 'tests', 'api.test.ts');
      const r = await gen({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'vitest', outputPath: out });
      expect(r.written).toBe(out);
      expect(existsSync(out)).toBe(true);
      expect(readFileSync(out, 'utf8')).toContain('describe(');
      await expect(handleGenerateTests({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'vitest', outputPath: out })).rejects.toThrow(/overwrite/);
      const replaced = await gen({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'vitest', outputPath: out, overwrite: true });
      expect(replaced.replaced).toBe(true);
      await expect(
        handleGenerateTests({ specPath: fixture('sample-openapi.yaml'), outputFormat: 'vitest', outputPath: join(tempProject(), 'x.ts') })
      ).rejects.toThrow(/outside the project/);
    } finally {
      delete process.env.API_TESTER_PROJECT_DIR;
    }
  });
});

describe('selection and bounds', () => {
  it('filters by operation and tag', async () => {
    const r = await gen({ specPath: fixture('swagger2-petstore.json'), operations: ['GET /pets'], includeNegativeTests: false });
    expect(r.tests.map((t: { name: string }) => t.name)).toEqual(['listPets — happy path']);
  });

  it('errors instead of returning zero tests when a filter matches nothing', async () => {
    await expect(handleGenerateTests({ specPath: fixture('swagger2-petstore.json'), filterTags: ['nope'] })).rejects.toThrow(/No operation matched/);
  });

  it('marks truncation when maxTests is hit', async () => {
    const r = await gen({ specPath: fixture('swagger2-petstore.json'), maxTests: 2 });
    expect(r.testsTruncated).toBe(true);
    expect(r.totalTests).toBeLessThanOrEqual(2);
  });
});

afterAll(() => {
  delete process.env.API_TESTER_PROJECT_DIR;
});
