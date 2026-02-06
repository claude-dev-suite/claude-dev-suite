// SPDX-License-Identifier: MIT
/**
 * Handler for backup_restore tool
 */

import { exec } from "child_process";
import { promisify } from "util";
import { stat, readdir } from "fs/promises";
import { join } from "path";
import { BackupRestoreSchema, jsonResponse, formatBytes, type Handler, type HandlerResult } from "./types.js";
import { parseConnectionEnv } from "./db.js";

const execAsync = promisify(exec);

export const handleBackupRestore: Handler = async (args): Promise<HandlerResult> => {
  const { operation, backupPath, format = 'custom', tables, schemaOnly = false, dataOnly = false } = BackupRestoreSchema.parse(args);

  const pgEnv = parseConnectionEnv();

  switch (operation) {
    case 'backup': {
      if (!backupPath) {
        throw new Error("backupPath is required for backup operation");
      }

      const formatFlag = format === 'custom' ? '-Fc' : format === 'directory' ? '-Fd' : '-Fp';
      let cmd = `pg_dump ${formatFlag} -f "${backupPath}"`;

      if (schemaOnly) cmd += ' --schema-only';
      if (dataOnly) cmd += ' --data-only';
      if (tables && tables.length > 0) {
        cmd += tables.map(t => ` -t "${t}"`).join('');
      }

      const startTime = Date.now();
      await execAsync(cmd, { env: { ...process.env, ...pgEnv } });
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

      let cmd: string;
      if (format === 'plain') {
        cmd = `psql -f "${backupPath}"`;
      } else {
        cmd = `pg_restore -d ${pgEnv.PGDATABASE} "${backupPath}"`;
        if (schemaOnly) cmd += ' --schema-only';
        if (dataOnly) cmd += ' --data-only';
        if (tables && tables.length > 0) {
          cmd += tables.map(t => ` -t "${t}"`).join('');
        }
      }

      const startTime = Date.now();
      await execAsync(cmd, { env: { ...process.env, ...pgEnv } });
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
