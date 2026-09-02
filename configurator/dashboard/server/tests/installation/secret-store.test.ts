/**
 * Secrets live outside the repository, or they eventually live in git.
 *
 * `~/.dev-suite/env/<id>.json` is the system of record for the values marked
 * `secret: true` in the MCP catalog. These tests pin the two properties that
 * make it usable as one: the id is stable for the same project across
 * case-differing paths on case-insensitive filesystems, and a merge never drops
 * a name it was not asked about.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  SecretEnvStore,
  collectSecretEnvNames,
  isLikelySecretName,
  projectStoreId,
  secretValuesIn,
  splitSecretEnvVars,
} from '../../src/services/installation/secret-store.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

describe('projectStoreId', () => {
  it('is stable for the same path', () => {
    expect(projectStoreId('/home/me/app')).toBe(projectStoreId('/home/me/app'));
  });

  it('ignores separator style and a trailing separator', () => {
    expect(projectStoreId('/home/me/app/')).toBe(projectStoreId('/home/me/app'));
  });

  it('distinguishes different projects', () => {
    expect(projectStoreId('/home/me/app')).not.toBe(projectStoreId('/home/me/other'));
  });

  it('is a single safe path segment', () => {
    // The id is joined onto a directory; a separator or a dot segment in it
    // would be a write outside `~/.dev-suite/env`.
    for (const p of ['/home/me/../etc', 'C:\\Users\\me\\My App (v2)', '/a/b/c']) {
      const id = projectStoreId(p);
      expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(id).not.toContain('/');
      expect(id).not.toContain('\\');
      expect(id).not.toContain('..');
    }
  });

  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  it.runIf(caseInsensitive)('folds case where the filesystem does', () => {
    // Same directory to the OS: two stores here means a reinstall launched from
    // a differently-cased path reports the project as uncredentialed.
    expect(projectStoreId('C:\\Users\\Me\\App')).toBe(projectStoreId('c:\\users\\me\\app'));
  });

  it.runIf(!caseInsensitive)('keeps case where the filesystem does', () => {
    expect(projectStoreId('/home/me/App')).not.toBe(projectStoreId('/home/me/app'));
  });
});

describe('SecretEnvStore', () => {
  let home: string;
  let project: string;
  let store: SecretEnvStore;

  beforeEach(() => {
    home = createTempDir('secret-home-');
    project = createTempDir('secret-project-');
    store = new SecretEnvStore(home);
  });
  afterEach(() => { cleanupTempDir(home); cleanupTempDir(project); });

  it('reads {} when nothing is stored', () => {
    expect(store.read(project)).toEqual({});
    expect(store.getStatus(project).names).toEqual([]);
  });

  it('round-trips values', () => {
    store.write(project, { DATABASE_URL: 'postgres://u:p@h/db' });
    expect(store.read(project)).toEqual({ DATABASE_URL: 'postgres://u:p@h/db' });
  });

  it('stores under ~/.dev-suite/env, outside any project', () => {
    store.write(project, { DATABASE_URL: 'x' });
    const file = store.getStorePath(project);
    expect(file.startsWith(path.join(home, '.dev-suite', 'env'))).toBe(true);
    expect(file.startsWith(project)).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('merges without dropping names it was not asked about', () => {
    store.write(project, { DATABASE_URL: 'db', ORCHESTRATOR_WS_TOKEN: 'tok' });
    store.merge(project, { DATABASE_URL: 'db2' });
    expect(store.read(project)).toEqual({ DATABASE_URL: 'db2', ORCHESTRATOR_WS_TOKEN: 'tok' });
  });

  it('ignores empty values on write and merge', () => {
    store.write(project, { DATABASE_URL: 'db', EMPTY: '   ' });
    expect(store.read(project)).toEqual({ DATABASE_URL: 'db' });
  });

  it('deletes the file when everything is cleared', () => {
    store.write(project, { DATABASE_URL: 'db' });
    store.write(project, {});
    expect(fs.existsSync(store.getStorePath(project))).toBe(false);
    expect(store.read(project)).toEqual({});
  });

  it('treats a corrupt store as absent rather than throwing', () => {
    store.write(project, { DATABASE_URL: 'db' });
    fs.writeFileSync(store.getStorePath(project), '{ not json');
    expect(store.read(project)).toEqual({});
  });

  it('reports names, never values', () => {
    store.write(project, { DATABASE_URL: 'postgres://u:hunter2@h/db' });
    const status = store.getStatus(project);
    expect(status.names).toEqual(['DATABASE_URL']);
    expect(JSON.stringify(status)).not.toContain('hunter2');
  });

  it.runIf(process.platform !== 'win32')('creates the file owner-only', () => {
    store.write(project, { DATABASE_URL: 'db' });
    expect(fs.statSync(store.getStorePath(project)).mode & 0o777).toBe(0o600);
    expect(store.getStatus(project).restrictedPermissions).toBe(true);
  });
});

describe('secret classification', () => {
  it('flags names that are sensitive on their face', () => {
    for (const name of ['ORCHESTRATOR_WS_TOKEN', 'OPENAI_API_KEY', 'DB_PASSWORD', 'MY_SECRET', 'GH_CREDENTIAL']) {
      expect(isLikelySecretName(name)).toBe(true);
    }
    for (const name of ['KB_REPO_BRANCH', 'DASHBOARD_PORT', 'DB_BACKUP_DIR', 'KB_CACHE_TTL']) {
      expect(isLikelySecretName(name)).toBe(false);
    }
  });

  it('splits wizard values into protected and plain', () => {
    const declared = new Set(['DATABASE_URL']);
    const { secrets, plain } = splitSecretEnvVars(
      { DATABASE_URL: 'db', KB_CACHE_TTL: '7200', SOME_TOKEN: 't' },
      declared
    );
    expect(secrets).toEqual({ DATABASE_URL: 'db', SOME_TOKEN: 't' });
    expect(plain).toEqual({ KB_CACHE_TTL: '7200' });
  });

  it('yields only non-empty secret values for the gitignore pass', () => {
    expect(secretValuesIn({ DATABASE_URL: '', TOKEN: 'abc' }, new Set(['DATABASE_URL'])))
      .toEqual(['abc']);
  });

  it('reads secret declarations out of the real catalog', () => {
    // The repository root is four levels up from tests/installation.
    const devSuiteDir = path.resolve(__dirname, '..', '..', '..', '..', '..');
    const names = collectSecretEnvNames(devSuiteDir);
    expect(names.has('DATABASE_URL')).toBe(true);
    expect(names.has('ORCHESTRATOR_WS_TOKEN')).toBe(true);
    expect(names.has('KB_REPO_BRANCH')).toBe(false);
    expect(names.has('DASHBOARD_PORT')).toBe(false);
  });

  it('returns an empty set when there is no catalog to read', () => {
    expect(collectSecretEnvNames(path.join(createTempDir('no-catalog-'), 'nope')).size).toBe(0);
  });
});
