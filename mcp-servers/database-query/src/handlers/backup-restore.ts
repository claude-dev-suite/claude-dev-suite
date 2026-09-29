// SPDX-License-Identifier: MIT
/**
 * backup_restore — engine-native backups, confined to one directory.
 *
 *  PostgreSQL : pg_dump / pg_restore / psql       (client tools on PATH or DB_CLIENT_BIN_DIR)
 *  MySQL      : mysqldump|mariadb-dump / mysql|mariadb
 *  SQLite     : VACUUM INTO (backup) and a verified file copy (restore) — no CLI needed
 *
 * Safety:
 *  - every path is confined to DB_BACKUP_DIR (default ~/.dev-suite/db-backups,
 *    outside any repository), including `list`; symlinks cannot escape it;
 *  - credentials go to the child through the environment (PGPASSWORD /
 *    MYSQL_PWD), never argv; inherited PG and MYSQL_ variables are dropped so
 *    they cannot redirect the tool to another server;
 *  - restore is a write: it needs a writable connection AND confirm:true;
 *    without confirm it returns the exact command it would run;
 *  - psql runs with ON_ERROR_STOP=1 and --single-transaction, pg_restore with
 *    --exit-on-error --single-transaction, so a failure is reported as a
 *    failure and leaves the database unchanged.
 */

import { spawn } from "child_process";
import { createReadStream, existsSync } from "fs";
import { copyFile, lstat, mkdir, open, readdir, realpath, stat } from "fs/promises";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { assertWithinRoot } from "@dev-suite/shared";
import type { ConnectionConfig } from "../config.js";
import { getDriver } from "../drivers/index.js";
import { SqliteDriver } from "../drivers/sqlite.js";
import { quoteLiteral } from "../sql-lexer.js";
import { BackupRestoreSchema, jsonResponse, errorResponse, formatBytes, type Handler } from "./types.js";

// ---------------------------------------------------------------------------
// CLI runner (injectable for tests)
// ---------------------------------------------------------------------------

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
export interface CliOptions {
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
  stdinFile?: string;
}
export type CliRunner = (cmd: string, args: string[], opts: CliOptions) => Promise<CliResult>;

const OUTPUT_CAP = 64 * 1024;
const CLI_TIMEOUT_MS = 60 * 60 * 1000;

export const spawnRunner: CliRunner = (cmd, args, opts) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { shell: false, env: opts.env, cwd: opts.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const keep = (buf: string, chunk: Buffer) => (buf + chunk.toString("utf-8")).slice(-OUTPUT_CAP);
    child.stdout.on("data", (c: Buffer) => (stdout = keep(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = keep(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut });
    });
    if (opts.stdinFile) {
      const rs = createReadStream(opts.stdinFile);
      rs.on("error", (e) => child.kill() && reject(e));
      rs.pipe(child.stdin);
    } else child.stdin.end();
  });

let runner: CliRunner = spawnRunner;
export function setCliRunner(r: CliRunner | null): void {
  runner = r ?? spawnRunner;
}

function binPath(cmd: string): string {
  const dir = process.env.DB_CLIENT_BIN_DIR;
  if (dir && dir.trim()) return join(dir, process.platform === "win32" ? `${cmd}.exe` : cmd);
  return cmd;
}

const INSTALL_HINT: Record<string, string> = {
  postgres:
    "Install the PostgreSQL client tools (Debian/Ubuntu: apt install postgresql-client; macOS: brew install libpq; Windows: EDB installer, 'Command Line Tools') — use a version >= the server's — or set DB_CLIENT_BIN_DIR to their bin directory.",
  mysql:
    "Install the MySQL or MariaDB client (Debian/Ubuntu: apt install default-mysql-client; macOS: brew install mysql-client) or set DB_CLIENT_BIN_DIR to its bin directory.",
};

async function run(engine: "postgres" | "mysql", cmds: string[], args: string[], env: NodeJS.ProcessEnv, stdinFile?: string) {
  for (const cmd of cmds) {
    try {
      const r = await runner(binPath(cmd), args, { env, cwd: backupRoot(), timeoutMs: CLI_TIMEOUT_MS, stdinFile });
      return { cmd, ...r };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; // try the next name
      throw e;
    }
  }
  const where = process.env.DB_CLIENT_BIN_DIR ? " in DB_CLIENT_BIN_DIR" : " on PATH";
  throw new Error(`${cmds.join(" / ")} not found${where}. ${INSTALL_HINT[engine]}`);
}

function failIfBad(r: CliResult & { cmd: string }, secrets: string[]): void {
  if (r.timedOut) throw new Error(`${r.cmd} timed out after ${CLI_TIMEOUT_MS / 60000} min`);
  if (r.code !== 0) {
    let tail = r.stderr.trim().slice(-4000) || r.stdout.trim().slice(-2000);
    for (const s of secrets) if (s) tail = tail.split(s).join("***");
    throw new Error(`${r.cmd} exited with code ${r.code}: ${tail || "(no output)"}`);
  }
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function backupRoot(): string {
  const d = process.env.DB_BACKUP_DIR;
  return resolve(d && d.trim() ? d : join(homedir(), ".dev-suite", "db-backups"));
}

/**
 * Resolve a caller path inside the backup root. Relative paths are relative
 * to the root. Symlinked ancestors are resolved before the containment check.
 */
export async function resolveBackupPath(p: string | undefined, opts: { mustExist: boolean }): Promise<string> {
  const root = backupRoot();
  await mkdir(root, { recursive: true });
  const realRoot = await realpath(root);
  if (p !== undefined && p.includes("\0")) throw new Error("backupPath contains a null byte");
  const target = p === undefined || p === "" ? realRoot : isAbsolute(p) ? resolve(p) : resolve(realRoot, p);
  const within = (x: string) => {
    try {
      assertWithinRoot(x, realRoot);
    } catch {
      throw new Error(`backupPath must be inside the backup directory ${realRoot} (DB_BACKUP_DIR)`);
    }
  };
  // allow absolute paths spelled via the unresolved root
  const normalized = target.startsWith(root) && root !== realRoot ? join(realRoot, target.slice(root.length)) : target;
  within(normalized);
  // resolve the nearest existing ancestor through symlinks
  let probe = normalized;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  within(await realpath(probe));
  if (existsSync(normalized)) {
    const st = await lstat(normalized);
    if (st.isSymbolicLink()) throw new Error("backupPath must not be a symbolic link");
  } else if (opts.mustExist) {
    throw new Error(`Backup not found: ${normalized}`);
  }
  return normalized;
}

async function sizeOf(p: string): Promise<number> {
  const st = await stat(p);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const f of await readdir(p)) total += await sizeOf(join(p, f));
  return total;
}

function validateTableName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/.test(name)) throw new Error(`Invalid table name: ${name}`);
  return name;
}

// ---------------------------------------------------------------------------
// Environment for client tools
// ---------------------------------------------------------------------------

function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(PG|MYSQL_)/i.test(k) || k === "DATABASE_URL" || k === "DATABASE_URLS") continue;
    env[k] = v;
  }
  return env;
}

export function pgEnv(c: ConnectionConfig): NodeJS.ProcessEnv {
  const n = c.net!;
  const env = baseEnv();
  env.PGHOST = n.host;
  env.PGPORT = String(n.port);
  if (n.user) env.PGUSER = n.user;
  if (n.password) env.PGPASSWORD = n.password;
  if (n.database) env.PGDATABASE = n.database;
  env.PGSSLMODE = n.ssl.mode;
  if (n.ssl.caPath) env.PGSSLROOTCERT = n.ssl.caPath;
  if (n.ssl.certPath) env.PGSSLCERT = n.ssl.certPath;
  if (n.ssl.keyPath) env.PGSSLKEY = n.ssl.keyPath;
  if (n.options.connectTimeoutSec) env.PGCONNECT_TIMEOUT = n.options.connectTimeoutSec;
  const opts = [n.options.options, n.options.searchPath ? `-c search_path=${n.options.searchPath}` : ""].filter(Boolean).join(" ");
  if (opts) env.PGOPTIONS = opts;
  env.PGAPPNAME = "dev-suite-database-query";
  return env;
}

export function mysqlEnvAndArgs(c: ConnectionConfig, mariaClient: boolean): { env: NodeJS.ProcessEnv; args: string[] } {
  const n = c.net!;
  const env = baseEnv();
  if (n.password) env.MYSQL_PWD = n.password;
  const args = [`--host=${n.host}`, `--port=${n.port}`, "--protocol=TCP"];
  if (n.user) args.push(`--user=${n.user}`);
  if (mariaClient) {
    if (n.ssl.mode === "disable") args.push("--skip-ssl");
    else {
      args.push("--ssl");
      if (n.ssl.mode === "verify-full") args.push("--ssl-verify-server-cert");
    }
  } else {
    args.push(
      `--ssl-mode=${{ disable: "DISABLED", require: "REQUIRED", "verify-ca": "VERIFY_CA", "verify-full": "VERIFY_IDENTITY" }[n.ssl.mode]}`
    );
  }
  if (n.ssl.caPath) args.push(`--ssl-ca=${n.ssl.caPath}`);
  if (n.ssl.certPath) args.push(`--ssl-cert=${n.ssl.certPath}`);
  if (n.ssl.keyPath) args.push(`--ssl-key=${n.ssl.keyPath}`);
  return { env, args };
}

async function mysqlClientIsMaria(tool: string[]): Promise<boolean> {
  try {
    const r = await run("mysql", tool, ["--version"], baseEnv());
    return /mariadb/i.test(r.stdout + r.stderr);
  } catch {
    return false;
  }
}

/** Env keys safe to show in a dry run. */
function describeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(PG|MYSQL_)/.test(k)) out[k] = /PASS|PWD/.test(k) ? "***" : String(v);
  }
  return out;
}

async function detectPgFormat(path: string): Promise<"custom" | "directory" | "plain"> {
  const st = await stat(path);
  if (st.isDirectory()) return "directory";
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    return buf.toString("latin1") === "PGDMP" ? "custom" : "plain";
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handleBackupRestore: Handler = async (args) => {
  const a = BackupRestoreSchema.parse(args);
  const driver = getDriver(a.connection);
  const c = driver.config;
  const engine = driver.engine;
  const secrets = c.net?.password ? [c.net.password] : [];

  if (a.operation === "list") {
    const dir = await resolveBackupPath(a.backupPath, { mustExist: false });
    if (!existsSync(dir)) return jsonResponse({ directory: dir, backups: [], count: 0 });
    const st = await stat(dir);
    if (!st.isDirectory()) {
      return jsonResponse({ path: dir, size: st.size, sizeFormatted: formatBytes(st.size), modified: st.mtime });
    }
    const names = (await readdir(dir)).sort();
    const entries = [];
    for (const f of names.slice(0, a.limit)) {
      const p = join(dir, f);
      const s = await lstat(p);
      if (s.isSymbolicLink()) continue;
      const size = await sizeOf(p);
      entries.push({ name: f, path: p, kind: s.isDirectory() ? "directory" : "file", size, sizeFormatted: formatBytes(size), modified: s.mtime });
    }
    return jsonResponse({ directory: dir, backups: entries, count: entries.length, total: names.length, truncated: names.length > a.limit });
  }

  if (a.schemaOnly && a.dataOnly) return errorResponse("schemaOnly and dataOnly are mutually exclusive");
  if (!a.backupPath) return errorResponse(`backupPath is required for ${a.operation} (relative to ${backupRoot()})`);

  // ---------------- backup ----------------
  if (a.operation === "backup") {
    const path = await resolveBackupPath(a.backupPath, { mustExist: false });
    if (existsSync(path)) return errorResponse(`Refusing to overwrite existing backup ${path}; choose a new name`);
    await mkdir(dirname(path), { recursive: true });
    const started = Date.now();
    let tool: string;
    if (engine === "postgres") {
      const fmt = a.format === "custom" ? "c" : a.format === "directory" ? "d" : "p";
      const argv = [`--format=${fmt}`, `--file=${path}`, "--no-password"];
      if (a.schemaOnly) argv.push("--schema-only");
      if (a.dataOnly) argv.push("--data-only");
      for (const t of a.tables ?? []) argv.push(`--table=${validateTableName(t)}`);
      const r = await run("postgres", ["pg_dump"], argv, pgEnv(c));
      failIfBad(r, secrets);
      tool = r.cmd;
    } else if (engine === "mysql") {
      if (a.format !== "plain" && a.format !== "custom")
        return errorResponse("MySQL backups are SQL dumps: use format 'plain'");
      if (!c.net?.database) return errorResponse("The connection URL has no database name to dump");
      const cmds = ["mysqldump", "mariadb-dump"];
      const maria = await mysqlClientIsMaria(cmds);
      const { env, args: base } = mysqlEnvAndArgs(c, maria);
      const argv = [...base, "--single-transaction", "--routines", "--triggers", "--no-tablespaces", `--result-file=${path}`];
      if (a.schemaOnly) argv.push("--no-data");
      if (a.dataOnly) argv.push("--no-create-info");
      argv.push(c.net.database, ...(a.tables ?? []).map(validateTableName));
      const r = await run("mysql", cmds, argv, env);
      failIfBad(r, secrets);
      tool = r.cmd;
    } else {
      if (a.tables?.length || a.schemaOnly || a.dataOnly)
        return errorResponse("SQLite backups copy the whole database file; tables/schemaOnly/dataOnly are not supported");
      if (a.format === "plain" || a.format === "directory") return errorResponse("SQLite backups are database files: use format 'custom'");
      const conn = await (driver as SqliteDriver).open({ readOnly: true, queryOnly: false });
      try {
        await conn.call({ type: "exec", sql: `VACUUM INTO ${quoteLiteral(path)}` }, CLI_TIMEOUT_MS);
      } finally {
        await conn.terminate();
      }
      tool = "VACUUM INTO";
    }
    const size = await sizeOf(path);
    return jsonResponse({
      success: true,
      operation: "backup",
      connection: c.name,
      engine,
      tool,
      path,
      format: engine === "sqlite" ? "sqlite-database" : engine === "mysql" ? "plain" : a.format,
      size,
      sizeFormatted: formatBytes(size),
      durationMs: Date.now() - started,
      options: { schemaOnly: a.schemaOnly, dataOnly: a.dataOnly, tables: a.tables ?? null },
    });
  }

  // ---------------- restore ----------------
  const path = await resolveBackupPath(a.backupPath, { mustExist: true });
  if (c.readOnly) {
    return errorResponse(
      `Restore writes to the database but connection "${c.name}" is read-only. Mark it writable (DATABASE_ALLOW_WRITES=true, or "readOnly": false in DATABASE_URLS).`
    );
  }
  const size = await sizeOf(path);
  let plan: { tool: string; args: string[]; env: NodeJS.ProcessEnv; stdinFile?: string; cmds: string[] } | null = null;
  const notes: string[] = [];

  if (engine === "postgres") {
    const fmt = await detectPgFormat(path);
    if (fmt !== a.format) notes.push(`detected ${fmt} format from the file (format parameter ignored)`);
    if (fmt === "plain") {
      if (a.tables?.length || a.schemaOnly || a.dataOnly || a.clean)
        return errorResponse("tables/schemaOnly/dataOnly/clean only apply to custom/directory dumps; a plain SQL file runs as a whole");
      plan = {
        tool: "psql",
        cmds: ["psql"],
        args: ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--single-transaction", "--no-password", "--quiet", `--file=${path}`],
        env: pgEnv(c),
      };
    } else {
      const argv = [`--dbname=${c.net!.database || "postgres"}`, "--exit-on-error", "--single-transaction", "--no-password"];
      if (a.clean) argv.push("--clean", "--if-exists");
      if (a.schemaOnly) argv.push("--schema-only");
      if (a.dataOnly) argv.push("--data-only");
      for (const t of a.tables ?? []) argv.push(`--table=${validateTableName(t)}`);
      argv.push(path);
      plan = { tool: "pg_restore", cmds: ["pg_restore"], args: argv, env: pgEnv(c) };
    }
  } else if (engine === "mysql") {
    if (a.tables?.length || a.schemaOnly || a.dataOnly || a.clean)
      return errorResponse("MySQL restore replays the whole SQL dump; tables/schemaOnly/dataOnly/clean are not supported");
    if (!c.net?.database) return errorResponse("The connection URL has no database name to restore into");
    const cmds = ["mysql", "mariadb"];
    const maria = await mysqlClientIsMaria(cmds);
    const { env, args: base } = mysqlEnvAndArgs(c, maria);
    plan = { tool: "mysql", cmds, args: [...base, c.net.database], env, stdinFile: path };
    notes.push("mysql stops at the first error; statements before it stay applied (DDL auto-commits)");
  } else {
    // SQLite: verified file copy with a safety copy of the current database.
    const fh = await open(path, "r");
    const header = Buffer.alloc(16);
    try {
      await fh.read(header, 0, 16, 0);
    } finally {
      await fh.close();
    }
    if (header.toString("latin1") !== "SQLite format 3\u0000") return errorResponse(`${path} is not a SQLite database file`);
    const dbFile = c.file!;
    const wal = `${dbFile}-wal`;
    const walBusy = existsSync(wal) && (await stat(wal)).size > 0;
    const safety = `${dbFile}.pre-restore-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
    const preview = { operation: "restore", connection: c.name, engine, from: path, size, into: dbFile, safetyCopy: safety };
    if (walBusy) return errorResponse(`${wal} is not empty — the database is open or was not checkpointed; stop the application first`, preview);
    if (!a.confirm) return jsonResponse({ dryRun: true, executed: false, ...preview, next: "Re-run with confirm: true to replace the database file." });
    if (existsSync(dbFile)) await copyFile(dbFile, safety);
    await copyFile(path, dbFile);
    return jsonResponse({ success: true, ...preview });
  }

  const preview = {
    operation: "restore",
    connection: c.name,
    engine,
    from: path,
    size,
    sizeFormatted: formatBytes(size),
    command: [plan.tool, ...plan.args],
    ...(plan.stdinFile ? { stdin: plan.stdinFile } : {}),
    environment: describeEnv(plan.env),
    notes,
  };
  if (!a.confirm) {
    return jsonResponse({ dryRun: true, executed: false, ...preview, next: "Re-run with confirm: true to run this command." });
  }
  const started = Date.now();
  const r = await run(engine, plan.cmds, plan.args, plan.env, plan.stdinFile);
  failIfBad(r, secrets);
  return jsonResponse({ success: true, ...preview, tool: r.cmd, durationMs: Date.now() - started });
};
