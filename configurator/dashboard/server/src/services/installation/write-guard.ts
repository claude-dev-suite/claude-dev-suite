// SPDX-License-Identifier: MIT
/**
 * Backup and rollback around a first install.
 *
 * `install()` used to write straight into the project with no snapshot and no
 * recovery, and it writes the manifest *last*. Any throw part-way through the
 * adapter loop therefore left every already-written file on disk with no record
 * of it: `.mcp.json` overwritten to `{"mcpServers":{}}` (destroying the user's
 * own server), `.claude/settings.json` mutated, `.claude/` and `.mcp-servers/`
 * populated — and `getStatus()` reporting `{installed:false}`, so the dashboard
 * offered the wizard again over a half-installed project.
 *
 * `reinstall.service.ts` already had this discipline. This is the same shape,
 * scoped to the surfaces an install touches, so both entry points are equally
 * recoverable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import { copyDirSync } from './file-operations.js';
import { managedSurfaces } from './managed-surfaces.js';
import { MCP_SERVERS_DIR, type TargetId } from '../targets/target-layout.js';
import { resolveInsideProject } from './uninstall.js';

const logger = getLogger('InstallWriteGuard');

const BACKUP_DIR_PREFIX = '.dev-suite-backup-';

/** A snapshot of everything an install is about to touch. */
export interface InstallSnapshot {
  /** Absolute path of the backup directory. */
  backupDir: string;
  /** Relative paths that existed before the install and were copied. */
  captured: string[];
  /** Relative paths that did NOT exist, so a rollback must delete them. */
  absent: string[];
}

function surfacesFor(targets: readonly TargetId[]): { dirs: string[]; files: string[] } {
  const { dirs, files } = managedSurfaces(targets);
  // `.mcp-servers/` is written by the install itself and is not a per-target
  // layout surface, so managedSurfaces does not know about it.
  return { dirs: [...dirs, MCP_SERVERS_DIR], files };
}

/**
 * Copy everything an install may overwrite into a timestamped backup directory.
 *
 * `timestamp` is injected so callers can keep it deterministic in tests.
 * Throws if the backup cannot be created — the caller must then abort rather
 * than write unprotected.
 */
export function snapshotBeforeInstall(
  projectPath: string,
  targets: readonly TargetId[],
  timestamp: string = new Date().toISOString().replace(/[:.]/g, '-')
): InstallSnapshot {
  const backupDir = path.join(projectPath, `${BACKUP_DIR_PREFIX}${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const { dirs, files } = surfacesFor(targets);
  const captured: string[] = [];
  const absent: string[] = [];

  for (const rel of dirs) {
    const src = resolveInsideProject(projectPath, rel);
    if (src && fs.existsSync(src)) {
      copyDirSync(src, path.join(backupDir, ...rel.split('/')));
      captured.push(rel);
    } else {
      absent.push(rel);
    }
  }

  for (const rel of files) {
    const src = resolveInsideProject(projectPath, rel);
    if (src && fs.existsSync(src)) {
      const dest = path.join(backupDir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      captured.push(rel);
    } else {
      absent.push(rel);
    }
  }

  logger.info('Snapshotted project before install', {
    context: { backupDir, captured: captured.length, absent: absent.length },
  });
  return { backupDir, captured, absent };
}

/**
 * Put the project back the way `snapshotBeforeInstall` found it.
 *
 * Surfaces that did not exist beforehand are deleted outright — a half-written
 * `.claude/` is worse than none. Surfaces that did exist are replaced with
 * their backed-up copy.
 */
export function rollbackInstall(projectPath: string, snapshot: InstallSnapshot): void {
  const isDir = new Set(surfacesFor([]).dirs);

  for (const rel of snapshot.absent) {
    const target = resolveInsideProject(projectPath, rel);
    if (!target || !fs.existsSync(target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (error: unknown) {
      logger.warn('Rollback could not remove a partially written surface', {
        error,
        context: { path: rel },
      });
    }
  }

  for (const rel of snapshot.captured) {
    const target = resolveInsideProject(projectPath, rel);
    const backup = path.join(snapshot.backupDir, ...rel.split('/'));
    if (!target || !fs.existsSync(backup)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
      if (isDir.has(rel) || fs.statSync(backup).isDirectory()) {
        copyDirSync(backup, target);
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(backup, target);
      }
    } catch (error: unknown) {
      logger.warn('Rollback could not restore a surface', { error, context: { path: rel } });
    }
  }

  logger.info('Rolled back a failed install', { context: { backupDir: snapshot.backupDir } });
}

/** Delete a snapshot once the install has succeeded. Best effort. */
export function discardSnapshot(snapshot: InstallSnapshot): void {
  try {
    fs.rmSync(snapshot.backupDir, { recursive: true, force: true });
  } catch (error: unknown) {
    logger.warn('Could not remove the install snapshot', {
      error,
      context: { backupDir: snapshot.backupDir },
    });
  }
}
