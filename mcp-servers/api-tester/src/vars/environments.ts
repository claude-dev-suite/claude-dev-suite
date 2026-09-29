// SPDX-License-Identifier: MIT
/**
 * Named environments persisted in the project:
 *
 *   .api-tester/environments.json    — names, plain variables, which keys are secret,
 *                                      the active environment. Safe to commit.
 *   .api-tester/secrets.local.json   — secret VALUES only (mode 0600), gitignored by
 *                                      the `.api-tester/.gitignore` written alongside.
 *
 * Secret values are never returned by any tool: `get`/`list` show `"***"`, and
 * every request that substitutes one registers it with the redactor.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { projectDir, writeFileAtomic } from '../util/paths.js';

export interface EnvironmentRecord {
  variables: Record<string, unknown>;
  secretKeys: string[];
}

interface EnvFile {
  version: 1;
  active?: string;
  environments: Record<string, EnvironmentRecord>;
}

type SecretsFile = Record<string, Record<string, string>>;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export function storeDir(): string {
  return join(projectDir(), '.api-tester');
}

function envPath(): string {
  return join(storeDir(), 'environments.json');
}

function secretsPath(): string {
  return join(storeDir(), 'secrets.local.json');
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw e;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${path} is not valid JSON; fix or delete it`);
  }
}

// Serialise writes within this process.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function load(): Promise<{ env: EnvFile; secrets: SecretsFile }> {
  const env = await readJson<EnvFile>(envPath(), { version: 1, environments: {} });
  if (!env.environments || typeof env.environments !== 'object') env.environments = {};
  const secrets = await readJson<SecretsFile>(secretsPath(), {});
  return { env, secrets };
}

async function save(env: EnvFile, secrets: SecretsFile): Promise<void> {
  await writeFileAtomic(join(storeDir(), '.gitignore'), 'secrets.local.json\n');
  await writeFileAtomic(envPath(), JSON.stringify(env, null, 2) + '\n');
  await writeFileAtomic(secretsPath(), JSON.stringify(secrets, null, 2) + '\n', 0o600);
}

function checkName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(`Invalid environment name "${name}" (letters, digits, "_", "-", "."; max 64)`);
  }
}

export interface ResolvedEnvironment {
  name: string;
  variables: Record<string, unknown>;
  secretValues: string[];
}

/** Variables of `name` (or the active environment when name is undefined), secrets merged in. */
export async function resolveEnvironment(name?: string): Promise<ResolvedEnvironment | undefined> {
  const { env, secrets } = await load();
  const target = name ?? env.active;
  if (!target) return undefined;
  const rec = env.environments[target];
  if (!rec) {
    if (name) throw new Error(`Unknown environment "${name}". Create it with the environment tool.`);
    return undefined;
  }
  const sec = secrets[target] ?? {};
  const variables = { ...rec.variables };
  for (const k of rec.secretKeys ?? []) if (k in sec) variables[k] = sec[k];
  return {
    name: target,
    variables,
    secretValues: (rec.secretKeys ?? []).map((k) => sec[k]).filter((v): v is string => typeof v === 'string'),
  };
}

function masked(rec: EnvironmentRecord, secrets: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rec.variables };
  for (const k of rec.secretKeys ?? []) out[k] = k in secrets ? '***' : '(secret, unset)';
  return out;
}

export async function listEnvironments(): Promise<unknown> {
  const { env } = await load();
  return {
    file: envPath(),
    active: env.active ?? null,
    environments: Object.entries(env.environments).map(([name, rec]) => ({
      name,
      variables: Object.keys(rec.variables ?? {}).length + (rec.secretKeys?.length ?? 0),
      secretKeys: rec.secretKeys ?? [],
      active: env.active === name,
    })),
  };
}

export async function getEnvironment(name?: string): Promise<unknown> {
  const { env, secrets } = await load();
  const target = name ?? env.active;
  if (!target) throw new Error('No environment named and none is active');
  const rec = env.environments[target];
  if (!rec) throw new Error(`Unknown environment "${target}"`);
  return {
    name: target,
    active: env.active === target,
    variables: masked(rec, secrets[target] ?? {}),
    secretKeys: rec.secretKeys ?? [],
  };
}

/**
 * Create or update. `variables` are plain; `secrets` values go to the local
 * secrets file and are only ever shown masked.
 */
export async function upsertEnvironment(
  name: string,
  opts: { variables?: Record<string, unknown>; secrets?: Record<string, string>; create?: boolean; activate?: boolean }
): Promise<unknown> {
  checkName(name);
  return locked(async () => {
    const { env, secrets } = await load();
    const exists = Boolean(env.environments[name]);
    if (opts.create && exists) throw new Error(`Environment "${name}" already exists; use action "set"`);
    if (!opts.create && !exists) throw new Error(`Unknown environment "${name}"; use action "create"`);
    const rec: EnvironmentRecord = env.environments[name] ?? { variables: {}, secretKeys: [] };
    rec.variables = rec.variables ?? {};
    rec.secretKeys = rec.secretKeys ?? [];
    const sec = (secrets[name] = secrets[name] ?? {});
    for (const [k, v] of Object.entries(opts.variables ?? {})) {
      rec.variables[k] = v;
      rec.secretKeys = rec.secretKeys.filter((s) => s !== k);
      delete sec[k];
    }
    for (const [k, v] of Object.entries(opts.secrets ?? {})) {
      delete rec.variables[k];
      if (!rec.secretKeys.includes(k)) rec.secretKeys.push(k);
      sec[k] = String(v);
    }
    env.environments[name] = rec;
    if (opts.activate || !env.active) env.active = name;
    await save(env, secrets);
    return {
      name,
      created: !exists,
      active: env.active === name,
      variables: masked(rec, sec),
      secretKeys: rec.secretKeys,
    };
  });
}

export async function unsetVariables(name: string, keys: string[]): Promise<unknown> {
  return locked(async () => {
    const { env, secrets } = await load();
    const rec = env.environments[name];
    if (!rec) throw new Error(`Unknown environment "${name}"`);
    const removed: string[] = [];
    for (const k of keys) {
      if (k in (rec.variables ?? {}) || rec.secretKeys?.includes(k)) removed.push(k);
      delete rec.variables[k];
      rec.secretKeys = (rec.secretKeys ?? []).filter((s) => s !== k);
      if (secrets[name]) delete secrets[name][k];
    }
    await save(env, secrets);
    return { name, removed, notFound: keys.filter((k) => !removed.includes(k)) };
  });
}

export async function activateEnvironment(name: string | null): Promise<unknown> {
  return locked(async () => {
    const { env, secrets } = await load();
    if (name !== null && !env.environments[name]) throw new Error(`Unknown environment "${name}"`);
    env.active = name ?? undefined;
    await save(env, secrets);
    return { active: env.active ?? null };
  });
}

/** Destructive: requires confirm; without it returns exactly what would be removed. */
export async function deleteEnvironment(name: string, confirm: boolean): Promise<unknown> {
  return locked(async () => {
    const { env, secrets } = await load();
    const rec = env.environments[name];
    if (!rec) throw new Error(`Unknown environment "${name}"`);
    const preview = {
      name,
      variables: Object.keys(rec.variables ?? {}),
      secretKeys: rec.secretKeys ?? [],
      wasActive: env.active === name,
    };
    if (!confirm) return { dryRun: true, wouldDelete: preview, hint: 'Pass confirm: true to delete' };
    delete env.environments[name];
    delete secrets[name];
    if (env.active === name) env.active = undefined;
    await save(env, secrets);
    return { deleted: preview };
  });
}
