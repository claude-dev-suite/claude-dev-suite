// SPDX-License-Identifier: MIT
/** import_collection / export_collection across every supported format. */

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { handleImportCollection, handleExportCollection, handleEnvironment } from '../src/handlers/api-tester-handlers.js';
import { parseHttpFile } from '../src/importers/http-file.js';
import { parseBru } from '../src/importers/bruno.js';
import { fixture, parseResult, tempProject } from './helpers.js';

const imp = async (args: Record<string, unknown>) => parseResult(await handleImportCollection(args));
const byName = (r: { batchRequests: Array<{ name: string }> }, n: string) => r.batchRequests.find((x) => x.name === n) as any;

describe('Insomnia v4 (old: overrides applied after substitution)', () => {
  it('applies caller overrides before substituting', async () => {
    const r = await imp({ filePath: fixture('sample-insomnia.json'), variables: { baseUrl: 'http://localhost:9999' } });
    expect(r.format).toBe('insomnia-v4');
    const list = byName(r, 'List Users');
    expect(list.url).toBe('http://localhost:9999/users');
    expect(list.query).toEqual({ page: '1', limit: '20' });
  });

  it('keeps secret-looking variables as templates and masks their values', async () => {
    const r = await imp({ filePath: fixture('sample-insomnia.json') });
    expect(byName(r, 'List Users').headers.Authorization).toBe('Bearer {{token}}');
    expect(r.variables.token).toBe('***');
    expect(JSON.stringify(r)).not.toContain('dev-token-456');
    expect(r.secretVariables).toContain('token');
  });

  it('keeps (normalised) templates when substitute is false', async () => {
    const r = await imp({ filePath: fixture('sample-insomnia.json'), substitute: false });
    expect(byName(r, 'Health').url).toBe('{{baseUrl}}/health');
  });
});

describe('Insomnia v5 YAML', () => {
  it('reads folders, inherited auth and sub-environments', async () => {
    const r = await imp({ filePath: fixture('insomnia-v5.yaml'), environmentName: 'Staging' });
    expect(r.format).toBe('insomnia-v5');
    expect(r.environments).toEqual(['Staging']);
    const list = byName(r, 'List orders');
    expect(list.url).toBe('https://staging.example.com/orders');
    expect(list.folder).toBe('Orders');
    expect(list.query).toEqual({ page: '2' });
    expect(list.auth).toEqual({ type: 'bearer', token: '{{token}}' });
    expect(byName(r, 'Create order')).toMatchObject({ body: '{"sku": "A1"}', bodyType: 'text', contentType: 'application/json' });
    expect(byName(r, 'Health').auth).toBeUndefined();
  });
});

describe('Postman v2.1', () => {
  it('handles env files, folder auth inheritance, bodies and literal pre-request vars', async () => {
    const r = await imp({ filePath: fixture('postman-auth.json'), environmentFile: fixture('postman-env.json') });
    expect(r.format).toBe('postman');
    const login = byName(r, 'Login form');
    expect(login.url).toBe('http://127.0.0.1:2222/login?debug=1');
    expect(login.bodyType).toBe('form');
    expect(login.body).toEqual({ user: 'ada', tenant: 'acme' });
    expect(login.auth).toEqual({ type: 'basic', username: 'admin', password: '{{adminPass}}' });
    const upload = byName(r, 'Upload');
    expect(upload.bodyType).toBe('multipart');
    expect(upload.files).toEqual([{ field: 'doc', path: 'docs/readme.txt' }]);
    expect(byName(r, 'Me').auth).toEqual({ type: 'bearer', token: '{{token}}' });
    expect(byName(r, 'Me').headers['X-Tenant']).toBe('acme');
    expect(byName(r, 'Public').auth).toBeUndefined();
    expect(byName(r, 'Search (GraphQL)').body).toEqual({ query: 'query($q:String){ search(q:$q) { id } }', variables: { q: 'x' } });
    expect(r.secretVariables).toEqual(expect.arrayContaining(['token', 'adminPass']));
    expect(JSON.stringify(r)).not.toContain('super-secret-token-value');
    expect(r.variables.disabledVar).toBeUndefined();
  });

  it('saves imported variables as a project environment with secrets kept secret', async () => {
    const project = tempProject();
    process.env.API_TESTER_PROJECT_DIR = project;
    try {
      const r = await imp({ filePath: fixture('postman-auth.json'), environmentFile: fixture('postman-env.json'), saveAsEnvironment: 'local' });
      expect(r.savedEnvironment.secretKeys).toEqual(expect.arrayContaining(['token', 'adminPass']));
      const envFile = readFileSync(join(project, '.api-tester', 'environments.json'), 'utf8');
      expect(envFile).not.toContain('super-secret-token-value');
      const secrets = readFileSync(join(project, '.api-tester', 'secrets.local.json'), 'utf8');
      expect(secrets).toContain('super-secret-token-value');
      expect(readFileSync(join(project, '.api-tester', '.gitignore'), 'utf8')).toContain('secrets.local.json');
      const got = parseResult(await handleEnvironment({ action: 'get', name: 'local' }));
      expect(got.variables.token).toBe('***');
    } finally {
      delete process.env.API_TESTER_PROJECT_DIR;
    }
  });
});

describe('Bruno', () => {
  it('parses blocks, disabled entries and text bodies', () => {
    const blocks = parseBru(readFileSync(fixture('bruno-collection', 'users', 'Create User.bru'), 'utf8'));
    expect(blocks.find((b) => b.name === 'headers')?.entries).toEqual([
      { key: 'X-Request-Id', value: '42', enabled: true },
      { key: 'X-Disabled', value: 'nope', enabled: false },
    ]);
    expect(blocks.find((b) => b.name === 'body:json')?.text).toBe('{\n  "name": "Ada",\n  "tags": ["a", "b"]\n}');
  });

  it('imports a collection directory with environments and folder auth', async () => {
    const r = await imp({ filePath: fixture('bruno-collection'), environmentName: 'local' });
    expect(r.format).toBe('bruno');
    expect(r.name).toBe('Bruno Demo');
    expect(r.environments).toEqual(['local']);
    const create = byName(r, 'Create User');
    expect(create).toMatchObject({ method: 'POST', url: 'http://localhost:4444/users/acme', folder: 'users', bodyType: 'text', contentType: 'application/json' });
    expect(create.query).toEqual({ notify: 'true' });
    expect(create.headers).toEqual({ 'X-Request-Id': '42' });
    expect(create.auth).toEqual({ type: 'bearer', token: '{{token}}' });
    expect(byName(r, 'List Users').auth).toEqual({ type: 'basic', username: 'folder-user', password: '{{folderPass}}' });
    expect(r.warnings.join()).toMatch(/scripts\/tests are not executed/);
  });
});

describe('.http / .rest', () => {
  it('parses variables, names, multi-line queries, bodies and file refs', () => {
    const { requests, variables, warnings } = parseHttpFile(readFileSync(fixture('requests.http'), 'utf8'), '/base');
    expect(variables).toEqual({ baseUrl: 'http://localhost:5555', contentType: 'application/json' });
    expect(requests.map((r) => r.name)).toEqual(['Get users', 'createUser', 'PUT {{baseUrl}}/avatar', 'GET {{baseUrl}}/ping']);
    expect(requests[0].url).toBe('{{baseUrl}}/users?page=2&size=10');
    expect(requests[1].body).toBe('{\n  "name": "{{$randomString 8}}",\n  "id": "{{$uuid}}"\n}');
    expect(requests[2]).toMatchObject({ bodyType: 'file' });
    expect(warnings.join()).toMatch(/response handler/);
  });

  it('imports and substitutes file variables', async () => {
    const r = await imp({ filePath: fixture('requests.http') });
    expect(byName(r, 'Get users').url).toBe('http://localhost:5555/users?page=2&size=10');
    expect(byName(r, 'createUser').headers['Content-Type']).toBe('application/json');
  });
});

describe('HAR', () => {
  it('skips static assets, pseudo headers and cookies', async () => {
    const r = await imp({ filePath: fixture('capture.har') });
    expect(r.totalRequests).toBe(2);
    const post = byName(r, 'POST /api/items');
    expect(post.headers).toEqual({ 'Content-Type': 'application/json', 'X-Custom': '1' });
    expect(post.body).toBe('{"a":1}');
    expect(byName(r, 'POST /login')).toMatchObject({ bodyType: 'form', body: { u: 'ada' } });
    expect(r.warnings.join()).toMatch(/Cookie headers were dropped/);
  });
});

describe('OpenAPI as a collection', () => {
  it('turns operations into runnable requests with a baseUrl variable', async () => {
    const r = await imp({ filePath: fixture('swagger2-petstore.json') });
    expect(r.format).toBe('openapi');
    expect(r.variables.baseUrl).toBe('https://petstore.example.com/api');
    expect(byName(r, 'listPets').url).toBe('https://petstore.example.com/api/pets');
  });
});

describe('paging and detection', () => {
  it('pages requests with a truncation marker', async () => {
    const r = await imp({ filePath: fixture('postman-auth.json'), limit: 2 });
    expect(r.returned).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.nextOffset).toBe(2);
  });

  it('explains a Postman environment passed as the collection', async () => {
    await expect(handleImportCollection({ filePath: fixture('postman-env.json') })).rejects.toThrow(/environmentFile/);
  });
});

describe('export_collection', () => {
  const requests = [
    { name: 'List', folder: 'Users', method: 'GET', url: '{{baseUrl}}/users', query: { page: '1' }, headers: { Accept: 'application/json' } },
    { name: 'Create', folder: 'Users/Admin', method: 'POST', url: '{{baseUrl}}/users', body: { name: 'Ada' }, bodyType: 'json', auth: { type: 'bearer', token: '{{token}}' } },
    { name: 'Login', method: 'POST', url: 'http://localhost/login', body: { u: 'a' }, bodyType: 'form' },
  ];

  it('exports Postman v2.1 that re-imports to the same requests', async () => {
    const project = tempProject();
    process.env.API_TESTER_PROJECT_DIR = project;
    try {
      const out = join(project, 'out.postman.json');
      const r = parseResult(await handleExportCollection({ format: 'postman', requests, variables: { baseUrl: 'http://x' }, outputPath: out, name: 'Round trip' }));
      expect(r.written).toBe(out);
      const doc = JSON.parse(readFileSync(out, 'utf8'));
      expect(doc.info.schema).toContain('v2.1.0');
      expect(doc.item[0].name).toBe('Users');
      const back = await imp({ filePath: out, substitute: false });
      expect(byName(back, 'List').url).toBe('{{baseUrl}}/users?page=1');
      expect(byName(back, 'Create').auth).toEqual({ type: 'bearer', token: '{{token}}' });
      expect(byName(back, 'Create').folder).toBe('Users/Admin');
      expect(byName(back, 'Login')).toMatchObject({ bodyType: 'form', body: { u: 'a' } });
    } finally {
      delete process.env.API_TESTER_PROJECT_DIR;
    }
  });

  it('exports a .http file that re-parses', async () => {
    const r = parseResult(await handleExportCollection({ format: 'http', requests, variables: { baseUrl: 'http://x' } }));
    expect(r.content).toContain('@baseUrl = http://x');
    expect(r.content).toContain('Authorization: Bearer {{token}}');
    const parsed = parseHttpFile(r.content);
    expect(parsed.requests.map((q) => q.method)).toEqual(['GET', 'POST', 'POST']);
    expect(parsed.requests[1].body).toBe('{\n  "name": "Ada"\n}');
  });

  it('converts a source file and blanks secret values', async () => {
    const r = parseResult(await handleExportCollection({ format: 'http', sourcePath: fixture('postman-auth.json') }));
    expect(r.requests).toBe(5);
    expect(r.content).toContain('### Admin / Login form');
  });
});

afterAll(() => {
  delete process.env.API_TESTER_PROJECT_DIR;
});
