// SPDX-License-Identifier: MIT
/**
 * 2026-08 audit, Tier 3 #27 — `backup_restore` writes wherever it is told, and
 * `restore` in `plain` format hands the file to `psql -f`, which executes the
 * SQL it contains. `DB_BACKUP_DIR` confines both.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { BackupRestoreSchema } from '../src/handlers/types.js';

const ROOT = path.resolve('/srv/backups');

// The handler reads the connection env before it validates arguments; supply a
// dummy so the assertions are about the path guard, not about configuration.
beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
});

afterEach(() => {
  delete process.env.DB_BACKUP_DIR;
  delete process.env.DATABASE_URL;
});

/** Exercises the handler's guard through a real call. */
async function runBackup(backupPath: string) {
  const { handleBackupRestore } = await import('../src/handlers/backup-restore.js');
  return handleBackupRestore(
    BackupRestoreSchema.parse({ operation: 'backup', backupPath, format: 'plain' })
  );
}

describe('backup path confinement', () => {
  it('still rejects a relative path', async () => {
    await expect(runBackup('backups/db.sql')).rejects.toThrow(/absolute/i);
  });

  it('still rejects a literal ".." segment', async () => {
    await expect(runBackup(`${ROOT}${path.sep}..${path.sep}db.sql`)).rejects.toThrow(/\.\./);
  });

  it('rejects a path outside DB_BACKUP_DIR when it is set', async () => {
    process.env.DB_BACKUP_DIR = ROOT;
    await expect(runBackup(path.resolve('/etc/cron.d/evil'))).rejects.toThrow(/DB_BACKUP_DIR/);
  });

  it('rejects a sibling that merely shares the prefix', async () => {
    process.env.DB_BACKUP_DIR = ROOT;
    await expect(runBackup(`${ROOT}-evil${path.sep}db.sql`)).rejects.toThrow(/DB_BACKUP_DIR/);
  });
});
