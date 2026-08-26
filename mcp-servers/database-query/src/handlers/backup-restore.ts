// SPDX-License-Identifier: MIT
/**
 * Handler for backup_restore tool
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { stat, readdir } from "fs/promises";
import { join, isAbsolute, resolve, sep } from "path";
import { BackupRestoreSchema, jsonResponse, formatBytes, type Handler, type HandlerResult } from "./types.js";
import { parseConnectionEnv } from "./db.js";

const execFileAsync = promisify(execFile);

/** Validate a table name to prevent command injection */
function validateTableName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$.]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}

/**
 * Validate a backup path.
 *
 * Absolute and traversal-free was never enough: `backup` writes wherever it is
 * told (any absolute path outside the project), and `restore` in `plain` format
 * feeds the file to `psql -f`, which executes whatever SQL it contains. Setting
 * `DB_BACKUP_DIR` confines both operations to one directory.
 *
 * The confinement is opt-in so existing setups keep working; without it the
 * historical behaviour is unchanged, and that is worth configuring away.
 */
function validateBackupPath(p: string): string {
  if (!isAbsolute(p)) {
    throw new Error("backupPath must be an absolute path");
  }
  if (p.includes("..")) {
    throw new Error("backupPath must not contain '..'");
  }

  const root = process.env.DB_BACKUP_DIR;
  if (root && root.length > 0) {
    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(p);
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
      throw new Error(`backupPath must be inside DB_BACKUP_DIR (${resolvedRoot})`);
    }
  }

  return p;
}

export const handleBackupRestore: Handler = async (args): Promise<HandlerResult> => {
  const { operation, backupPath, format = 'custom', tables, schemaOnly = false, dataOnly = false } = BackupRestoreSchema.parse(args);

  const pgEnv = parseConnectionEnv();

  switch (operation) {
    case 'backup': {
      if (!backupPath) {
        throw new Error("backupPath is required for backup operation");
      }
      validateBackupPath(backupPath);

      const formatFlag = format === 'custom' ? '-Fc' : format === 'directory' ? '-Fd' : '-Fp';
      const args: string[] = [formatFlag, '-f', backupPath];

      if (schemaOnly) args.push('--schema-only');
      if (dataOnly) args.push('--data-only');
      if (tables && tables.length > 0) {
        for (const t of tables) {
          args.push('-t', validateTableName(t));
        }
      }

      const startTime = Date.now();
      await execFileAsync('pg_dump', args, { env: { ...process.env, ...pgEnv } });
      const duration = Date.now() - startTime;

      const stats = await stat(backupPath);

      return jsonResponse({
        success: true,
        operation: 'backup',
        path: backupPath,
        format,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        duration: `${duration}ms`,
        options: { schemaOnly, dataOnly, tables },
      });
    }

    case 'restore': {
      if (!backupPath) {
        throw new Error("backupPath is required for restore operation");
      }
      validateBackupPath(backupPath);

      let restoreCmd: string;
      let restoreArgs: string[];

      if (format === 'plain') {
        restoreCmd = 'psql';
        restoreArgs = ['-f', backupPath];
      } else {
        restoreCmd = 'pg_restore';
        restoreArgs = ['-d', pgEnv.PGDATABASE || 'postgres', backupPath];
        if (schemaOnly) restoreArgs.push('--schema-only');
        if (dataOnly) restoreArgs.push('--data-only');
        if (tables && tables.length > 0) {
          for (const t of tables) {
            restoreArgs.push('-t', validateTableName(t));
          }
        }
      }

      const startTime = Date.now();
      await execFileAsync(restoreCmd, restoreArgs, { env: { ...process.env, ...pgEnv } });
      const duration = Date.now() - startTime;

      return jsonResponse({
        success: true,
        operation: 'restore',
        path: backupPath,
        duration: `${duration}ms`,
        options: { schemaOnly, dataOnly, tables },
      });
    }

    case 'list': {
      if (backupPath) {
        const stats = await stat(backupPath);
        if (stats.isDirectory()) {
          const files = await readdir(backupPath);
          const backups = await Promise.all(
            files
              .filter(f => f.endsWith('.dump') || f.endsWith('.sql') || f.endsWith('.backup'))
              .map(async (f) => {
                const filePath = join(backupPath, f);
                const fileStats = await stat(filePath);
                return {
                  name: f,
                  path: filePath,
                  size: fileStats.size,
                  sizeFormatted: formatBytes(fileStats.size),
                  created: fileStats.birthtime,
                  modified: fileStats.mtime,
                };
              })
          );

          return jsonResponse({
            directory: backupPath,
            backups,
            count: backups.length,
          });
        } else {
          return jsonResponse({
            path: backupPath,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            created: stats.birthtime,
            modified: stats.mtime,
          });
        }
      } else {
        return jsonResponse({
          error: "Provide backupPath to list backup files in a directory",
        });
      }
    }
  }

  throw new Error(`Unknown operation: ${operation}`);
};
