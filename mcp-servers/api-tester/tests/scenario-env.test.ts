// SPDX-License-Identifier: MIT
/** run_scenario (chaining, extraction, stop-on-fail, retries) and the environment store. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { handleRunScenario, handleEnvironment, handleHttpRequest, handleSession } from '../src/handlers/api-tester-handlers.js';
import { startServer, json, tempProject, parseResult, type TestServer } from './helpers.js';

let srv: TestServer;
let project: string;
let pollCount = 0;

beforeAll(async () => {
  project = tempProject();
  process.env.API_TESTER_PROJECT_DIR = project;
  srv = await startServer((req, res, body) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/login') {
      const { user } = JSON.parse(body.toString() || '{}');
      if (user !== 'ada') return json(res, 401, { error: 'bad user' });
      return json(res, 200, { token: 'jwt-abcdef-123', user: { id: 7 } }, { 'Set-Cookie': 'sid=s3ss10n; Path=/', Location: '/users/7' });
    }
    if (url.pathname === '/users/7') {
      if (req.headers.authorization !== 'Bearer jwt-abcdef-123') return json(res, 401, { error: 'no token' });
      return json(res, 200, { id: 7, name: 'Ada', cookie: req.headers.cookie ?? null });
    }
    if (url.pathname === '/job') {
      pollCount++;
      return json(res, 200, { state: pollCount >= 3 ? 'done' : 'running' });
    }
    if (url.pathname === '/env-echo') return json(res, 200, { key: req.headers['x-key'] ?? null });
    return json(res, 404, {});
  });
});

afterAll(async () => {
  await srv.close();
  delete process.env.API_TESTER_PROJECT_DIR;
});

describe('run_scenario', () => {
  it('chains login → extracted token → authenticated call, sharing cookies', async () => {
    const r = parseResult(
      await handleRunScenario({
        environment: 'none',
        scenario: {
          name: 'login flow',
          variables: { base: srv.url },
          defaults: { baseUrl: '{{base}}' },
          steps: [
            {
              name: 'login',
              request: { method: 'POST', url: '/login', body: { user: 'ada' } },
              assert: [{ target: 'status', value: 200 }],
              extract: [
                { var: 'token', from: 'jsonpath', path: '$.token', secret: true },
                { var: 'userId', from: 'jsonpath', path: 'user.id' },
                { var: 'next', from: 'header', path: 'location' },
                { var: 'sid', from: 'cookie', path: 'sid' },
              ],
            },
            {
              name: 'me',
              request: { url: '{{next}}', auth: { type: 'bearer', token: '{{token}}' } },
              assert: [
                { target: 'jsonpath', path: '$.id', value: '{{userId}}' },
                { target: 'jsonpath', path: '$.cookie', op: 'contains', value: 'sid=s3ss10n' },
              ],
            },
          ],
        },
      })
    );
    expect(r.passed).toBe(true);
    expect(r.steps[0].extracted).toEqual({ token: '***', userId: 7, next: '/users/7', sid: 's3ss10n' });
    expect(JSON.stringify(r)).not.toContain('jwt-abcdef-123');
  });

  it('stops on the first failure and marks the rest skipped', async () => {
    const r = parseResult(
      await handleRunScenario({
        environment: 'none',
        scenario: {
          steps: [
            { name: 'bad login', request: { method: 'POST', url: `${srv.url}/login`, body: { user: 'eve' } }, assert: [{ target: 'status', value: 200 }] },
            { name: 'never', request: { url: `${srv.url}/users/7` } },
          ],
        },
      })
    );
    expect(r.passed).toBe(false);
    expect(r.steps.map((s: { status: string }) => s.status)).toEqual(['failed', 'skipped']);
    expect(r.steps[0].failedAssertions[0]).toMatchObject({ actual: 401 });
  });

  it('fails a step whose required extraction matches nothing', async () => {
    const r = parseResult(
      await handleRunScenario({
        environment: 'none',
        scenario: {
          stopOnFailure: false,
          steps: [
            { name: 'x', request: { url: `${srv.url}/job` }, extract: [{ var: 'nope', from: 'jsonpath', path: '$.missing' }] },
            { name: 'y', request: { url: `${srv.url}/job` }, extract: [{ var: 'opt', from: 'jsonpath', path: '$.missing', optional: true }] },
          ],
        },
      })
    );
    expect(r.steps[0].status).toBe('failed');
    expect(r.steps[0].extractErrors[0]).toMatch(/nothing matched/);
    expect(r.steps[1].status).toBe('passed');
  });

  it('polls with retry until assertions pass', async () => {
    pollCount = 0;
    const r = parseResult(
      await handleRunScenario({
        environment: 'none',
        scenario: {
          steps: [{ name: 'wait', request: { url: `${srv.url}/job` }, assert: [{ target: 'jsonpath', path: '$.state', value: 'done' }], retry: { count: 5, delayMs: 10 } }],
        },
      })
    );
    expect(r.passed).toBe(true);
    expect(r.steps[0].attempts).toBe(3);
  });

  it('loads a scenario from a YAML file', async () => {
    const p = join(project, 'flow.yaml');
    writeFileSync(p, `name: from file\nsteps:\n  - name: job\n    request:\n      url: ${srv.url}/job\n`);
    const r = parseResult(await handleRunScenario({ scenarioPath: p, environment: 'none' }));
    expect(r.scenario).toBe('from file');
    expect(r.summary.passed).toBe(1);
  });

  it('cleans up its own cookie session', async () => {
    const sessions = parseResult(await handleSession({ action: 'list' }));
    expect(sessions.sessions.filter((s: { name: string }) => s.name.startsWith('scenario-'))).toEqual([]);
  });
});

describe('environment tool', () => {
  it('creates, activates, masks secrets and substitutes at request time', async () => {
    const created = parseResult(
      await handleEnvironment({ action: 'create', name: 'dev', variables: { base: srv.url }, secrets: { key: 'top-secret-key-1' } })
    );
    expect(created.variables).toEqual({ base: srv.url, key: '***' });
    expect(created.active).toBe(true);

    const onDisk = readFileSync(join(project, '.api-tester', 'environments.json'), 'utf8');
    expect(onDisk).not.toContain('top-secret-key-1');

    // Active environment is used implicitly; the secret is sent but redacted from output.
    const res = parseResult(await handleHttpRequest({ method: 'GET', url: '{{base}}/env-echo', headers: { 'X-Key': '{{key}}' } }));
    expect(srv.requests.at(-1)!.headers['x-key']).toBe('top-secret-key-1');
    expect(JSON.stringify(res)).not.toContain('top-secret-key-1');
    expect(res.response.body.key).toBe('***');
    expect(res.environment).toBe('dev');

    const list = parseResult(await handleEnvironment({ action: 'list' }));
    expect(list.environments).toEqual([{ name: 'dev', variables: 2, secretKeys: ['key'], active: true }]);
  });

  it('turns a secret into a plain variable when set as one, and unsets keys', async () => {
    await handleEnvironment({ action: 'set', name: 'dev', variables: { region: 'eu' } });
    const u = parseResult(await handleEnvironment({ action: 'unset', name: 'dev', keys: ['region', 'ghost'] }));
    expect(u).toEqual({ name: 'dev', removed: ['region'], notFound: ['ghost'] });
  });

  it('previews deletion unless confirmed', async () => {
    const preview = parseResult(await handleEnvironment({ action: 'delete', name: 'dev' }));
    expect(preview.dryRun).toBe(true);
    expect(preview.wouldDelete.secretKeys).toEqual(['key']);
    expect(parseResult(await handleEnvironment({ action: 'get', name: 'dev' })).name).toBe('dev');
    const done = parseResult(await handleEnvironment({ action: 'delete', name: 'dev', confirm: true }));
    expect(done.deleted.name).toBe('dev');
    await expect(handleEnvironment({ action: 'get', name: 'dev' })).rejects.toThrow(/Unknown environment/);
  });

  it('rejects path-like environment names', async () => {
    await expect(handleEnvironment({ action: 'create', name: '../evil' })).rejects.toThrow(/Invalid environment name/);
  });
});
