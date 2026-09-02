// SPDX-License-Identifier: MIT
/**
 * Credentials Service Tests
 *
 * Pins the behaviour the orchestrator depends on: which env var each credential
 * kind maps to, that a stored credential beats an ambient one, that the secret
 * never leaks into the masked status, and that verification only reports
 * "invalid" for an actual auth rejection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempDir, cleanupTempDir } from './test-utils.js';
import { CredentialsService, CredentialValidationError } from '../src/services/credentials.service.js';

vi.mock('../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const API_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const OAUTH_TOKEN = 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const ADMIN_KEY = 'sk-ant-admin01-abcdefghijklmnopqrstuvwxyz0123456789ABCD';

let homeDir: string;
let service: CredentialsService;
let storeFile: string;

/** Env vars this suite mutates, restored after each test. */
const ORIGINAL_ENV = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
};

beforeEach(() => {
  homeDir = createTempDir('dev-suite-credentials-');
  service = new CredentialsService(homeDir);
  storeFile = path.join(homeDir, '.dev-suite', 'credentials.json');
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
});

afterEach(() => {
  cleanupTempDir(homeDir);
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------

describe('CredentialsService - classification', () => {
  it('classifies an API key and an OAuth token by prefix', () => {
    expect(service.detectKind(API_KEY)).toBe('api_key');
    expect(service.detectKind(OAUTH_TOKEN)).toBe('oauth_token');
  });

  it('rejects an Admin API key, which cannot run the model', () => {
    expect(() => service.detectKind(ADMIN_KEY)).toThrow(CredentialValidationError);
    expect(() => service.detectKind(ADMIN_KEY)).toThrow(/Admin API key/);
  });

  it('rejects a value pasted with a shell prefix or line break', () => {
    expect(() => service.detectKind(`export ANTHROPIC_API_KEY=${API_KEY}`)).toThrow(/whitespace/);
  });

  it('rejects an empty credential', () => {
    expect(() => service.detectKind('   ')).toThrow(CredentialValidationError);
  });

  it('returns null for an unrecognised prefix rather than guessing', () => {
    expect(service.detectKind('some-gateway-token-value')).toBeNull();
  });
});

describe('CredentialsService - persistence', () => {
  it('stores an API key and reports it as configured without exposing it', () => {
    const status = service.save(API_KEY);

    expect(status.configured).toBe(true);
    expect(status.source).toBe('stored');
    expect(status.kind).toBe('api_key');
    expect(status.envVar).toBe('ANTHROPIC_API_KEY');
    expect(status.preview).not.toContain(API_KEY.slice(20));
    expect(JSON.stringify(status)).not.toContain(API_KEY);
  });

  it('trims surrounding whitespace before storing', () => {
    service.save(`  ${API_KEY}  `);

    const stored = JSON.parse(fs.readFileSync(storeFile, 'utf-8')) as { value: string };
    expect(stored.value).toBe(API_KEY);
  });

  it('honours an explicit kind for a credential it cannot classify', () => {
    const status = service.save('some-gateway-token-value', 'oauth_token');

    expect(status.kind).toBe('oauth_token');
    expect(status.envVar).toBe('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('refuses an unclassifiable credential when no kind is given', () => {
    expect(() => service.save('some-gateway-token-value')).toThrow(/Could not tell/);
    expect(fs.existsSync(storeFile)).toBe(false);
  });

  it('replaces a previous credential rather than accumulating', () => {
    service.save(API_KEY);
    const status = service.save(OAUTH_TOKEN);

    expect(status.kind).toBe('oauth_token');
    expect(service.load()?.value).toBe(OAUTH_TOKEN);
  });

  it('clears the stored credential', () => {
    service.save(API_KEY);
    const status = service.clear();

    expect(status.configured).toBe(false);
    expect(status.source).toBe('none');
    expect(fs.existsSync(storeFile)).toBe(false);
  });

  it('treats a malformed store as absent so the dashboard still starts', () => {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, '{ not json');

    expect(service.load()).toBeNull();
    expect(service.getStatus().configured).toBe(false);
  });

  it('treats a store with an unknown kind as absent', () => {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ kind: 'admin_key', value: ADMIN_KEY }));

    expect(service.load()).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('writes the store owner-only', () => {
    service.save(API_KEY);

    expect(fs.statSync(storeFile).mode & 0o777).toBe(0o600);
  });
});

// `restrictedPermissions` is a claim the panel makes about a secret on disk, so
// it has to be measured from the file rather than assumed from the platform:
// `restrictPermissions()` only warns when chmod fails, and it does fail silently
// on some network and non-POSIX mounts.
describe('CredentialsService - store permissions', () => {
  it('reports nothing about permissions when no store exists', () => {
    const status = service.getStatus();

    expect(status.configured).toBe(false);
    expect(status.restrictedPermissions).toBeUndefined();
  });

  it('reads the file rather than the platform, so a deleted store reports nothing', () => {
    service.save(API_KEY);
    expect(service.getStatus().restrictedPermissions).toBeDefined();

    // Remove the store behind the service's back: a platform constant would go
    // on answering, a measured value cannot.
    fs.rmSync(storeFile);

    expect(service.getStatus().restrictedPermissions).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')(
    'reports a store the chmod did not reach as not owner-only',
    () => {
      service.save(API_KEY);
      expect(service.getStatus().restrictedPermissions).toBe(true);

      // Stand in for an SMB/NFS/exFAT $HOME, or a store written before
      // restrictPermissions() existed.
      fs.chmodSync(storeFile, 0o644);

      expect(service.getStatus().restrictedPermissions).toBe(false);
    }
  );

  it.skipIf(process.platform !== 'win32')(
    'never claims owner-only on Windows, where a POSIX mode says nothing',
    () => {
      service.save(API_KEY);

      expect(service.getStatus().restrictedPermissions).toBe(false);
    }
  );
});

describe('CredentialsService - precedence', () => {
  it('reports an ambient API key when nothing is stored', () => {
    process.env.ANTHROPIC_API_KEY = API_KEY;

    const status = service.getStatus();
    expect(status.configured).toBe(true);
    expect(status.source).toBe('environment');
    expect(status.kind).toBe('api_key');
  });

  it('prefers ANTHROPIC_API_KEY over CLAUDE_CODE_OAUTH_TOKEN, as the CLI does', () => {
    process.env.ANTHROPIC_API_KEY = API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = OAUTH_TOKEN;

    expect(service.getStatus().kind).toBe('api_key');
  });

  it('lets a stored credential override an ambient one', () => {
    process.env.ANTHROPIC_API_KEY = API_KEY;
    service.save(OAUTH_TOKEN);

    const status = service.getStatus();
    expect(status.source).toBe('stored');
    expect(status.kind).toBe('oauth_token');
  });
});

describe('CredentialsService - Agent SDK env', () => {
  it('contributes nothing when no credential is stored', () => {
    expect(service.resolveAuthEnv()).toEqual({});
  });

  it('sets ANTHROPIC_API_KEY and unsets the OAuth token for an API key', () => {
    service.save(API_KEY);

    expect(service.resolveAuthEnv()).toEqual({
      ANTHROPIC_API_KEY: API_KEY,
      CLAUDE_CODE_OAUTH_TOKEN: undefined,
    });
  });

  it('unsets ANTHROPIC_API_KEY for an OAuth token, which it would otherwise outrank', () => {
    service.save(OAUTH_TOKEN);

    expect(service.resolveAuthEnv()).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: OAUTH_TOKEN,
      ANTHROPIC_API_KEY: undefined,
    });
  });

  it('spreads the base environment so the spawned CLI keeps PATH', () => {
    service.save(API_KEY);

    const env = service.buildAgentEnv({ PATH: '/usr/bin', ANTHROPIC_API_KEY: 'stale-key' });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.ANTHROPIC_API_KEY).toBe(API_KEY);
  });

  it('leaves the base environment untouched when nothing is stored', () => {
    const env = service.buildAgentEnv({ PATH: '/usr/bin', ANTHROPIC_API_KEY: 'ambient-key' });

    expect(env.ANTHROPIC_API_KEY).toBe('ambient-key');
  });
});

describe('CredentialsService - verification', () => {
  /** Stub global fetch and hand back the recorded request headers. */
  function stubFetch(status: number): { headersFor: () => Record<string, string> } {
    let captured: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: { headers: Record<string, string> }) => {
        captured = init.headers;
        return Promise.resolve({ ok: status >= 200 && status < 300, status } as Response);
      }),
    );
    return { headersFor: () => captured };
  }

  it('reports a working API key as valid and sends it as x-api-key', async () => {
    const { headersFor } = stubFetch(200);
    service.save(API_KEY);

    const result = await service.verify();

    expect(result.status).toBe('valid');
    expect(headersFor()['x-api-key']).toBe(API_KEY);
    expect(headersFor()['authorization']).toBeUndefined();
  });

  it('sends an OAuth token as a bearer with the oauth beta flag', async () => {
    const { headersFor } = stubFetch(200);
    service.save(OAUTH_TOKEN);

    await service.verify();

    expect(headersFor()['authorization']).toBe(`Bearer ${OAUTH_TOKEN}`);
    expect(headersFor()['anthropic-beta']).toBe('oauth-2025-04-20');
  });

  it('reports 401 as invalid', async () => {
    stubFetch(401);
    service.save(API_KEY);

    const result = await service.verify();
    expect(result.status).toBe('invalid');
    expect(result.httpStatus).toBe(401);
  });

  it('reports a rate limit as inconclusive, not as a bad key', async () => {
    stubFetch(429);
    service.save(API_KEY);

    expect((await service.verify()).status).toBe('inconclusive');
  });

  it('reports a server outage as inconclusive', async () => {
    stubFetch(503);
    service.save(API_KEY);

    expect((await service.verify()).status).toBe('inconclusive');
  });

  it('reports a network failure as inconclusive rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ENOTFOUND'))));
    service.save(API_KEY);

    const result = await service.verify();
    expect(result.status).toBe('inconclusive');
    expect(result.message).toContain('ENOTFOUND');
  });

  it('verifies an unsaved candidate without storing it', async () => {
    const { headersFor } = stubFetch(200);

    const result = await service.verify(API_KEY);

    expect(result.status).toBe('valid');
    expect(headersFor()['x-api-key']).toBe(API_KEY);
    expect(fs.existsSync(storeFile)).toBe(false);
  });

  it('is inconclusive when there is nothing configured to verify', async () => {
    const result = await service.verify();

    expect(result.status).toBe('inconclusive');
    expect(result.message).toContain('No credential');
  });
});
