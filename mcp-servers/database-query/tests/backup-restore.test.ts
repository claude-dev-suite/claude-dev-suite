// SPDX-License-Identifier: MIT
/**
 * backup_restore with a fake CLI runner (no pg_dump/mysql needed).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleBackupRestore, setCliRunner, type CliOptions } from '../src/handlers/backup-restore.js';
import { callTool } from '../src/handlers/dispatch.js';
import { installFakes, parse, resetFakes } from './helpers.js';

let root: string;
let calls: Array<{ cmd: string; args: string[]; opts: CliOptions }>;
let exitCode = 0;
let stderr = '';
let missing = new Set<string>();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dbq-backup-'));
  calls = [];
  exitCode = 0;
  stderr = '';
  missing = new Set();
  setCliRunner(async (cmd, args, opts) => {
    if (missing.has(cmd)) throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    calls.push({ cmd, args, opts });
    const file = args.find((a) => a.startsWith('--file=') || a.startsWith('--result-file='))?.split('=').slice(1).join('=');
    if (file && exitCode === 0 && !args.includes('--no-psqlrc')) writeFileSync(file, 'dump');
    return { code: exitCode, stdout: cmd.includes('mysql') && args[0] === '--version' ? 'mysqldump  Ver 8.0.36' : '', stderr, timedOut: false };
  });
});

afterEach(() => {
  setCliRunner(null);
  resetFakes();
  rmSync(root, { recursive: true, force: true });
});

const pgEnv = (extra: Record<string, string> = {}) =>
  installFakes({ DATABASE_URL: 'postgres://app:p%40ss@db.internal:5433/shop?sslmode=require', DB_BACKUP_DIR: root, ...extra });

describe('backup (postgres)', () => {
  it('passes the decoded password via PGPASSWORD, never argv, and confines the path', async () => {
    pgEnv();
    const r = parse(await handleBackupRestore({ operation: 'backup', backupPath: 'shop.dump' }));
    expect(r.success).toBe(true);
    const c = calls[0];
    expect(c.cmd).toBe('pg_dump');
    expect(c.args).toEqual(['--format=c', `--file=${join(root, 'shop.dump')}`, '--no-password']);
    expect(c.opts.env.PGPASSWORD).toBe('p@ss');
    expect(c.opts.env.PGHOST).toBe('db.internal');
    expect(c.opts.env.PGPORT).toBe('5433');
    expect(c.opts.env.PGSSLMODE).toBe('require');
    expect(c.args.join(' ')).not.toContain('p@ss');
  });

  it('refuses to overwrite an existing backup', async () => {
    pgEnv();
    writeFileSync(join(root, 'x.dump'), 'old');
    const r = await handleBackupRestore({ operation: 'backup', backupPath: 'x.dump' });
    expect(parse(r).error).toMatch(/Refusing to overwrite/);
  });

  it('a failing pg_dump is an error with its stderr, not success', async () => {
    pgEnv();
    exitCode = 1;
    stderr = 'pg_dump: error: server version mismatch';
    const r = await callTool('backup_restore', { operation: 'backup', backupPath: 'y.dump' });
    expect(r.isError).toBe(true);
    expect(parse(r).error).toMatch(/server version mismatch/);
  });

  it('missing client tools produce an actionable error', async () => {
    pgEnv();
    missing.add('pg_dump');
    const r = await callTool('backup_restore', { operation: 'backup', backupPath: 'z.dump' });
    expect(parse(r).error).toMatch(/pg_dump not found on PATH.*DB_CLIENT_BIN_DIR/);
  });
});

describe('path confinement (old defect: list skipped validation; no DB_BACKUP_DIR meant no confinement)', () => {
  // A drive path only escapes on Windows; elsewhere it is an odd file name inside the directory.
  const outside = process.platform === 'win32' ? [['C:\\Windows\\win.ini']] : [];
  it.each([['../escape.sql'], ['/etc/passwd'], ...outside])('rejects %s', async (p) => {
    pgEnv();
    const r = await callTool('backup_restore', { operation: 'backup', backupPath: p });
    expect(parse(r).error).toMatch(/inside the backup directory/);
  });

  it('list is confined too', async () => {
    pgEnv();
    const r = await callTool('backup_restore', { operation: 'list', backupPath: '..' });
    expect(parse(r).error).toMatch(/inside the backup directory/);
  });

  it('rejects a sibling directory that merely shares the prefix', async () => {
    pgEnv();
    const r = await callTool('backup_restore', { operation: 'backup', backupPath: `${root}-evil/db.sql` });
    expect(parse(r).error).toMatch(/inside the backup directory/);
  });

  it('a symlinked sub-directory cannot escape the root', async () => {
    pgEnv();
    const outside = mkdtempSync(join(tmpdir(), 'dbq-outside-'));
    try {
      symlinkSync(outside, join(root, 'link'), 'junction');
    } catch {
      return; // symlinks not permitted on this machine
    }
    const r = await callTool('backup_restore', { operation: 'backup', backupPath: 'link/x.dump' });
    expect(parse(r).error).toMatch(/inside the backup directory/);
    rmSync(outside, { recursive: true, force: true });
  });

  it('lists backups with truncation', async () => {
    pgEnv();
    for (let i = 0; i < 3; i++) writeFileSync(join(root, `b${i}.dump`), 'x');
    mkdirSync(join(root, 'dirdump'));
    const r = parse(await handleBackupRestore({ operation: 'list', limit: 2 }));
    expect(r.count).toBe(2);
    expect(r.total).toBe(4);
    expect(r.truncated).toBe(true);
  });
});

describe('restore (old defect: unguarded destructive write, psql without ON_ERROR_STOP)', () => {
  it('is refused on a read-only connection', async () => {
    pgEnv();
    writeFileSync(join(root, 'a.sql'), 'select 1;');
    const r = await callTool('backup_restore', { operation: 'restore', backupPath: 'a.sql', confirm: true });
    expect(parse(r).error).toMatch(/read-only/);
    expect(calls).toHaveLength(0);
  });

  it('without confirm returns the exact command and runs nothing', async () => {
    pgEnv({ DATABASE_ALLOW_WRITES: 'true' });
    writeFileSync(join(root, 'a.sql'), 'select 1;');
    const r = parse(await handleBackupRestore({ operation: 'restore', backupPath: 'a.sql', format: 'plain' }));
    expect(r.dryRun).toBe(true);
    expect(calls).toHaveLength(0);
    expect(r.command).toEqual(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--single-transaction', '--no-password', '--quiet', `--file=${join(root, 'a.sql')}`]);
    expect(r.environment.PGPASSWORD).toBe('***');
  });

  it('confirm:true runs psql with ON_ERROR_STOP and reports failure as an error', async () => {
    pgEnv({ DATABASE_ALLOW_WRITES: 'true' });
    writeFileSync(join(root, 'a.sql'), 'select 1;');
    exitCode = 3;
    stderr = 'psql:a.sql:1: ERROR:  relation "x" does not exist';
    const r = await callTool('backup_restore', { operation: 'restore', backupPath: 'a.sql', confirm: true });
    expect(r.isError).toBe(true);
    expect(calls[0].args).toContain('--set=ON_ERROR_STOP=1');
    expect(parse(r).error).toMatch(/relation "x" does not exist/);
  });

  it('detects custom format and uses pg_restore --exit-on-error --single-transaction', async () => {
    pgEnv({ DATABASE_ALLOW_WRITES: 'true' });
    writeFileSync(join(root, 'c.dump'), 'PGDMP\u0001binary');
    const r = parse(await handleBackupRestore({ operation: 'restore', backupPath: 'c.dump', clean: true, confirm: true }));
    expect(r.success).toBe(true);
    expect(calls[0].cmd).toBe('pg_restore');
    expect(calls[0].args).toEqual(expect.arrayContaining(['--dbname=shop', '--exit-on-error', '--single-transaction', '--clean', '--if-exists']));
  });

  it('a missing backup file is an error', async () => {
    pgEnv({ DATABASE_ALLOW_WRITES: 'true' });
    const r = await callTool('backup_restore', { operation: 'restore', backupPath: 'nope.dump', confirm: true });
    expect(parse(r).error).toMatch(/Backup not found/);
  });
});

describe('mysql', () => {
  it('mysqldump gets MYSQL_PWD via env and --result-file', async () => {
    installFakes({ DATABASE_URL: 'mysql://root:pw%21@h:3307/app', DB_BACKUP_DIR: root });
    const r = parse(await handleBackupRestore({ operation: 'backup', backupPath: 'app.sql', format: 'plain' }));
    expect(r.success).toBe(true);
    const dump = calls.find((c) => c.args[0] !== '--version')!;
    expect(dump.cmd).toBe('mysqldump');
    expect(dump.opts.env.MYSQL_PWD).toBe('pw!');
    expect(dump.args).toEqual(expect.arrayContaining(['--host=h', '--port=3307', '--user=root', '--single-transaction', `--result-file=${join(root, 'app.sql')}`, 'app']));
    expect(dump.args.join(' ')).not.toContain('pw!');
  });

  it('falls back to mariadb-dump when mysqldump is absent', async () => {
    installFakes({ DATABASE_URL: 'mysql://root:pw@h/app', DB_BACKUP_DIR: root });
    missing.add('mysqldump');
    const r = parse(await handleBackupRestore({ operation: 'backup', backupPath: 'app2.sql', format: 'plain' }));
    expect(r.tool).toBe('mariadb-dump');
  });

  it('restore pipes the file to mysql on stdin', async () => {
    installFakes({ DATABASE_URL: 'mysql://root:pw@h/app', DB_BACKUP_DIR: root, DATABASE_ALLOW_WRITES: 'true' });
    writeFileSync(join(root, 'r.sql'), 'select 1;');
    const r = parse(await handleBackupRestore({ operation: 'restore', backupPath: 'r.sql', confirm: true }));
    expect(r.success).toBe(true);
    const run = calls.find((c) => c.args[0] !== '--version')!;
    expect(run.opts.stdinFile).toBe(join(root, 'r.sql'));
    expect(existsSync(join(root, 'r.sql'))).toBe(true);
  });
});
