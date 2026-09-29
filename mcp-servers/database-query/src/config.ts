// SPDX-License-Identifier: MIT
/**
 * Connection configuration.
 *
 * Connections come from two places, both operator-controlled:
 *   - `DATABASE_URL`   → the connection named "default"
 *   - `DATABASE_URLS`  → JSON object of named connections:
 *       { "analytics": "mysql://…", "local": { "url": "sqlite:./dev.db", "readOnly": false } }
 *
 * Every connection is READ-ONLY unless explicitly marked writable
 * (`readOnly: false` in DATABASE_URLS, or `DATABASE_ALLOW_WRITES=true` for
 * DATABASE_URL). Operator-configured connections are trusted: they may point at
 * private hosts, because that is where databases live. URLs passed as tool
 * arguments are not trusted and go through `adhoc.ts` instead.
 */

import { readFileSync } from "fs";
import { isAbsolute, resolve } from "path";

export type Engine = "postgres" | "mysql" | "sqlite";

export const ENGINE_LABEL: Record<Engine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL/MariaDB",
  sqlite: "SQLite",
};

export interface SslConfig {
  /** Normalised mode, libpq vocabulary. */
  mode: "disable" | "require" | "verify-ca" | "verify-full";
  ca?: string;
  cert?: string;
  key?: string;
  /** Paths as given, for reporting (never the file contents). */
  caPath?: string;
  certPath?: string;
  keyPath?: string;
}

export interface NetworkTarget {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: SslConfig;
  /** Extra driver options derived from recognised query parameters. */
  options: Record<string, string>;
  /** Query parameters that were not understood and therefore not applied. */
  ignoredParams: string[];
  notes: string[];
}

export interface ConnectionConfig {
  name: string;
  engine: Engine;
  readOnly: boolean;
  /** Redacted URL — safe to show. */
  displayUrl: string;
  /** postgres / mysql */
  net?: NetworkTarget;
  /** sqlite */
  file?: string;
  /** sqlite: ":memory:" style database */
  memory?: boolean;
  source: "DATABASE_URL" | "DATABASE_URLS" | "ad-hoc";
}

export interface ConnectionRegistry {
  connections: Map<string, ConnectionConfig>;
  errors: string[];
  defaultName: string | null;
}

export const DEFAULT_CONNECTION = "default";

// ---------------------------------------------------------------------------
// Tunables (all env-driven, all optional)
// ---------------------------------------------------------------------------

function intEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function statementTimeoutMs(): number {
  return intEnv(process.env.DB_STATEMENT_TIMEOUT_MS, 30_000, 100, 3_600_000);
}

export function maxRowsCap(): number {
  return intEnv(process.env.DB_MAX_ROWS, 10_000, 1, 1_000_000);
}

function boolEnv(raw: string | undefined): boolean {
  return raw !== undefined && /^(1|true|yes|on)$/i.test(raw.trim());
}

export function allowPrivateAdhocUrls(): boolean {
  return boolEnv(process.env.DB_ALLOW_PRIVATE_ADHOC_URLS);
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SECRET_PARAM = /^(password|pass|pwd|sslpassword|secret|token|key|sslkey)$/i;

/** Redact credentials from any connection URL. Never throws. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "***";
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET_PARAM.test(k)) u.searchParams.set(k, "***");
    }
    return u.toString();
  } catch {
    return raw.replace(/(\/\/[^/@:]*:)[^@/]*@/, "$1***@").replace(/(password=)[^&\s]*/gi, "$1***");
  }
}

/** Remove every known secret from an arbitrary message (driver errors echo URLs). */
export function redactText(text: string, secrets: string[] = []): string {
  let out = text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:)[^@\s/]+@/gi, "$1***@");
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join("***");
  }
  return out;
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export function engineForScheme(protocol: string): Engine {
  const p = protocol.replace(/:$/, "").toLowerCase();
  if (p === "postgres" || p === "postgresql") return "postgres";
  if (p === "mysql" || p === "mysql2" || p === "mariadb") return "mysql";
  if (p === "sqlite" || p === "sqlite3" || p === "file") return "sqlite";
  if (p.startsWith("mongodb")) {
    throw new Error(
      "MongoDB is not supported by the database-query server (SQL engines only: PostgreSQL, MySQL/MariaDB, SQLite)"
    );
  }
  throw new Error(
    `Unsupported connection URL scheme "${p}:" — use postgres://, mysql://, mariadb:// or sqlite:`
  );
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function readCertFile(path: string, what: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`Cannot read ${what} file "${path}": ${(e as Error).message}`);
  }
}

/**
 * Parse a SQLite URL. Accepted forms:
 *   sqlite:relative/dev.db   sqlite:./dev.db   file:./dev.db   (relative to the server cwd)
 *   sqlite:///abs/path.db    sqlite:///C:/data/app.db        sqlite::memory:
 */
export function parseSqliteUrl(raw: string): { file: string; memory: boolean } {
  let rest = raw.replace(/^(sqlite3?|file):/i, "");
  const q = rest.indexOf("?");
  if (q >= 0) rest = rest.slice(0, q);
  if (rest === ":memory:" || rest === "//:memory:" || rest === "") {
    return { file: ":memory:", memory: true };
  }
  if (rest.startsWith("//")) rest = rest.slice(2); // sqlite://<path>
  // "/C:/x" (from sqlite:///C:/x) → "C:/x"
  if (/^\/[A-Za-z]:[\\/]/.test(rest)) rest = rest.slice(1);
  rest = decode(rest);
  const file = isAbsolute(rest) ? rest : resolve(process.cwd(), rest);
  return { file, memory: false };
}

/**
 * Parse a PostgreSQL or MySQL URL into explicit driver settings.
 *
 * Done by hand instead of handing the string to the driver so that (a) the
 * password is percent-decoded for every consumer, including the CLI env for
 * pg_dump/mysqldump, (b) sslmode means what libpq says it means, and (c) any
 * parameter we do not understand is reported rather than silently dropped.
 */
export function parseNetworkUrl(raw: string, engine: "postgres" | "mysql"): NetworkTarget {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid connection URL: ${redactUrl(raw)}`);
  }
  const params = new Map<string, string>();
  for (const [k, v] of u.searchParams) params.set(k.toLowerCase(), v);

  const notes: string[] = [];
  const options: Record<string, string> = {};
  const consumed = new Set<string>();
  const take = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      if (params.has(k)) {
        consumed.add(k);
        return params.get(k);
      }
    }
    return undefined;
  };

  let host = decode(u.hostname).replace(/^\[|\]$/g, "");
  const hostParam = take("host");
  if (hostParam) host = hostParam; // unix socket dir / override
  const defaultPort = engine === "postgres" ? 5432 : 3306;
  const port = u.port ? Number(u.port) : Number(take("port") ?? defaultPort);
  const database = decode(u.pathname.replace(/^\//, "")) || take("dbname", "database") || "";
  const user = decode(u.username) || take("user") || "";
  const password = decode(u.password) || take("password") || "";

  // --- SSL ---------------------------------------------------------------
  const rawMode = (take("sslmode", "ssl-mode", "ssl_mode") ?? "").toLowerCase().replace(/_/g, "-");
  const sslFlag = take("ssl");
  const caPath = take("sslrootcert", "ssl-ca", "sslca");
  const certPath = take("sslcert", "ssl-cert");
  const keyPath = take("sslkey", "ssl-key");
  let mode: SslConfig["mode"];
  switch (rawMode) {
    case "":
      if (sslFlag !== undefined && /^(1|true|require)$/i.test(sslFlag)) mode = "verify-full";
      else mode = caPath ? "verify-ca" : "disable";
      break;
    case "disable":
    case "disabled":
      mode = "disable";
      break;
    case "allow":
    case "prefer":
    case "preferred":
      // node-postgres and mysql2 cannot "try TLS then fall back"; libpq's
      // default of prefer therefore becomes plain text here. Say so.
      mode = "disable";
      notes.push(`sslmode=${rawMode} cannot fall back in this driver and is treated as disable; use require for TLS`);
      break;
    case "require":
    case "required":
    case "no-verify":
      // libpq: require + a root cert behaves like verify-ca.
      mode = caPath && rawMode !== "no-verify" ? "verify-ca" : "require";
      break;
    case "verify-ca":
      mode = "verify-ca";
      break;
    case "verify-full":
    case "verify-identity":
      mode = "verify-full";
      break;
    default:
      throw new Error(`Unsupported sslmode "${rawMode}"`);
  }
  const ssl: SslConfig = { mode };
  if (mode !== "disable") {
    if (caPath) {
      ssl.ca = readCertFile(caPath, "SSL root certificate");
      ssl.caPath = caPath;
    }
    if (certPath) {
      ssl.cert = readCertFile(certPath, "SSL client certificate");
      ssl.certPath = certPath;
    }
    if (keyPath) {
      ssl.key = readCertFile(keyPath, "SSL client key");
      ssl.keyPath = keyPath;
    }
  }

  // --- Recognised driver options ----------------------------------------
  const connectTimeout = take("connect_timeout", "connecttimeout");
  if (connectTimeout) options.connectTimeoutSec = connectTimeout;
  if (engine === "postgres") {
    const app = take("application_name");
    if (app) options.application_name = app;
    const opts = take("options");
    if (opts) options.options = opts;
    const schema = take("schema", "currentschema", "search_path");
    if (schema) options.searchPath = schema; // Prisma-style ?schema=
  } else {
    const charset = take("charset");
    if (charset) options.charset = charset;
  }

  const ignoredParams = [...params.keys()].filter((k) => !consumed.has(k));
  if (ignoredParams.length) notes.push(`Ignored URL parameters: ${ignoredParams.join(", ")}`);

  return { host: host || "localhost", port, database, user, password, ssl, options, ignoredParams, notes };
}

export function buildConnection(
  name: string,
  url: string,
  readOnly: boolean,
  source: ConnectionConfig["source"]
): ConnectionConfig {
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  if (!scheme) throw new Error(`Connection "${name}": URL has no scheme (${redactUrl(url)})`);
  const engine = engineForScheme(scheme);
  if (engine === "sqlite") {
    const { file, memory } = parseSqliteUrl(url);
    return { name, engine, readOnly, displayUrl: `sqlite:${file}`, file, memory, source };
  }
  const net = parseNetworkUrl(url, engine);
  return { name, engine, readOnly, displayUrl: redactUrl(url), net, source };
}

const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/** Build the registry from the environment. Never throws — errors are collected. */
export function loadRegistry(env: NodeJS.ProcessEnv = process.env): ConnectionRegistry {
  const connections = new Map<string, ConnectionConfig>();
  const errors: string[] = [];

  const primary = env.DATABASE_URL;
  if (primary && primary.trim()) {
    try {
      connections.set(
        DEFAULT_CONNECTION,
        buildConnection(DEFAULT_CONNECTION, primary.trim(), !boolEnv(env.DATABASE_ALLOW_WRITES), "DATABASE_URL")
      );
    } catch (e) {
      errors.push(`DATABASE_URL: ${redactText((e as Error).message, [primary])}`);
    }
  }

  const multi = env.DATABASE_URLS;
  if (multi && multi.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(multi);
    } catch {
      errors.push('DATABASE_URLS is not valid JSON (expected {"name": "url" | {"url": "...", "readOnly": false}})');
    }
    if (parsed !== undefined) {
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        errors.push("DATABASE_URLS must be a JSON object keyed by connection name");
      } else {
        for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!NAME_RE.test(name)) {
            errors.push(`DATABASE_URLS: invalid connection name "${name}" (letters, digits, _ . - only)`);
            continue;
          }
          if (connections.has(name)) {
            errors.push(`DATABASE_URLS: connection "${name}" is already defined by DATABASE_URL; rename it`);
            continue;
          }
          let url: unknown;
          let readOnly = true;
          if (typeof value === "string") url = value;
          else if (value && typeof value === "object") {
            const v = value as Record<string, unknown>;
            url = v.url;
            if (v.readOnly !== undefined && typeof v.readOnly !== "boolean") {
              errors.push(`DATABASE_URLS.${name}.readOnly must be a boolean`);
              continue;
            }
            readOnly = v.readOnly !== false;
          }
          if (typeof url !== "string" || !url.trim()) {
            errors.push(`DATABASE_URLS.${name}: missing "url"`);
            continue;
          }
          try {
            connections.set(name, buildConnection(name, url.trim(), readOnly, "DATABASE_URLS"));
          } catch (e) {
            errors.push(`DATABASE_URLS.${name}: ${redactText((e as Error).message, [url])}`);
          }
        }
      }
    }
  }

  let defaultName: string | null = null;
  if (connections.has(DEFAULT_CONNECTION)) defaultName = DEFAULT_CONNECTION;
  else if (connections.size === 1) defaultName = [...connections.keys()][0];

  return { connections, errors, defaultName };
}

let cached: ConnectionRegistry | null = null;

export function getRegistry(): ConnectionRegistry {
  if (!cached) cached = loadRegistry();
  return cached;
}

/** Test hook. */
export function resetRegistry(): void {
  cached = null;
}

export function resolveConnection(name?: string): ConnectionConfig {
  const reg = getRegistry();
  const wanted = name ?? reg.defaultName;
  if (!wanted) {
    if (reg.connections.size === 0) {
      const why = reg.errors.length ? ` Configuration errors: ${reg.errors.join("; ")}` : "";
      throw new Error(
        `No database connection configured. Set DATABASE_URL (or DATABASE_URLS as JSON).${why}`
      );
    }
    throw new Error(
      `Several connections are configured and none is named "default"; pass connection: one of ${[
        ...reg.connections.keys(),
      ].join(", ")}`
    );
  }
  const conn = reg.connections.get(wanted);
  if (!conn) {
    const known = [...reg.connections.keys()];
    const errs = reg.errors.length ? ` Configuration errors: ${reg.errors.join("; ")}` : "";
    throw new Error(
      `Unknown connection "${wanted}". Configured: ${known.length ? known.join(", ") : "(none)"}.${errs}`
    );
  }
  return conn;
}

/** Secrets that must never appear in tool output. */
export function allSecrets(): string[] {
  const out: string[] = [];
  for (const c of getRegistry().connections.values()) {
    if (c.net?.password) out.push(c.net.password, encodeURIComponent(c.net.password));
  }
  return out;
}
