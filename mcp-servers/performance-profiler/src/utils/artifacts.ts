// SPDX-License-Identifier: MIT
/**
 * Artifact directory management. Profiles, flame graphs, heap snapshots and
 * run records are kept (the old code deleted every profile it produced), so a
 * developer can open them in DevTools / speedscope / JMC afterwards.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { outputRoot } from './env.js';

/** A short, sortable, filesystem-safe id: 20260929-123456-ab12cd. */
export function newRunId(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

export function isValidRunId(id: string): boolean {
  return /^\d{8}-\d{6}-[0-9a-f]{6}$/.test(id);
}

/** Create `<output>/runs/<runId>-<kind>/` and return it. */
export async function createRunDir(kind: string, runId: string = newRunId()): Promise<{ runId: string; dir: string }> {
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
  const dir = join(outputRoot(), 'runs', `${runId}-${safeKind}`);
  await mkdir(dir, { recursive: true });
  return { runId, dir };
}

export async function writeArtifact(dir: string, name: string, content: string | Buffer): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}
