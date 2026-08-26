// SPDX-License-Identifier: MIT
/**
 * Serialise the operations that rewrite a project's dev-suite installation.
 *
 * The pipeline's central invariant — *the manifest on disk describes the last
 * completed installation* — was not defended by anything. `install`,
 * `reinstall`, `add/removeAgent` and `add/removeMcpServer` all run the same
 * read-plan-write sequence, and the manifest is deliberately written last. Two
 * of them overlapping therefore produced a manifest describing neither run:
 * the second read the *pre-existing* manifest as its "previously managed" set,
 * so files the first had just written were invisible to it, and the write-guard
 * snapshots could restore each other's intermediate state.
 *
 * A per-project in-process mutex is the right scope: the dashboard is a
 * single-process, localhost-only server, so every writer goes through here.
 * (A cross-process lock file would additionally cover a CLI run racing the
 * dashboard; that is a bigger change and is noted rather than assumed.)
 */

import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('ProjectLock');

/** Tail of the queue per project: awaiting it means every earlier op finished. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Projects held by the current async context.
 *
 * The lock MUST be re-entrant: `reinstall` and the Manage tab's add/remove both
 * take it and then delegate to `install()`, which takes it again. A plain mutex
 * would deadlock on the second acquisition. AsyncLocalStorage tracks the holder
 * across awaits, so a nested acquisition of a project already held by this same
 * operation is a no-op rather than a wait.
 */
const held = new AsyncLocalStorage<Set<string>>();

/** Normalise so two spellings of the same project share one queue. */
function keyFor(projectPath: string): string {
  return path.resolve(projectPath).toLowerCase();
}

/**
 * Run `fn` with exclusive access to `projectPath`.
 *
 * Operations queue in call order and never overlap. A rejection is contained:
 * it propagates to its own caller, and the queue continues with the next.
 */
export async function withProjectLock<T>(
  projectPath: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = keyFor(projectPath);

  // Already held by this operation — run inline rather than deadlock on it.
  const current_held = held.getStore();
  if (current_held?.has(key)) {
    return fn();
  }

  const previous = queues.get(key) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  queues.set(key, current);

  // Wait for whatever was queued before us; its failure is not ours.
  await previous.catch(() => undefined);

  const waited = queues.get(key) === current;
  if (!waited) logger.debug('Project queue advanced while waiting', { context: { key, label } });

  const scope = new Set(current_held ?? []);
  scope.add(key);

  try {
    return await held.run(scope, fn);
  } finally {
    release();
    // Only clear when nothing queued behind us, so the map does not grow.
    if (queues.get(key) === current) queues.delete(key);
  }
}

/** Test seam: true when an operation is queued or running for this project. */
export function isProjectLocked(projectPath: string): boolean {
  return queues.has(keyFor(projectPath));
}
