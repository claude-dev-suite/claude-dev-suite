// SPDX-License-Identifier: MIT
/**
 * Driver cache: one driver (pool) per configured connection.
 */

import { validateUrl } from "@dev-suite/shared";
import {
  type ConnectionConfig,
  type Engine,
  ENGINE_LABEL,
  allowPrivateAdhocUrls,
  buildConnection,
  engineForScheme,
  redactUrl,
  resolveConnection,
} from "../config.js";
import type { Driver } from "./types.js";
import { UnsupportedError } from "./types.js";
import { PostgresDriver } from "./postgres.js";
import { MysqlDriver } from "./mysql.js";
import { SqliteDriver } from "./sqlite.js";

export type DriverFactory = (config: ConnectionConfig) => Driver;

export const defaultFactory: DriverFactory = (config) => {
  switch (config.engine) {
    case "postgres":
      return new PostgresDriver(config);
    case "mysql":
      return new MysqlDriver(config);
    case "sqlite":
      return new SqliteDriver(config);
  }
};

let factory: DriverFactory = defaultFactory;
const drivers = new Map<string, Driver>();

/** Test hook: swap the factory (and drop cached drivers). */
export function setDriverFactory(f: DriverFactory | null): void {
  factory = f ?? defaultFactory;
  drivers.clear();
}

export function getDriver(connection?: string): Driver {
  const config = resolveConnection(connection);
  let d = drivers.get(config.name);
  if (!d) {
    d = factory(config);
    drivers.set(config.name, d);
  }
  return d;
}

export async function closeAll(): Promise<void> {
  const all = [...drivers.values()];
  drivers.clear();
  await Promise.allSettled(all.map((d) => d.close()));
}

/** Throw a clear error when a tool does not support the connection's engine. */
export function requireEngine(driver: Driver, tool: string, supported: readonly Engine[]): void {
  if (!supported.includes(driver.engine)) {
    throw new UnsupportedError(
      `${tool} is not supported on ${ENGINE_LABEL[driver.engine]} (connection "${driver.config.name}"). Supported: ${supported
        .map((e) => ENGINE_LABEL[e])
        .join(", ")}`
    );
  }
}

/**
 * An ad-hoc URL passed as a TOOL ARGUMENT (e.g. compare_schemas'
 * targetDatabaseUrl). Unlike operator-configured connections these are not
 * trusted: the model chose the host, so the shared SSRF policy applies —
 * cloud metadata is always blocked; loopback is allowed; private ranges are blocked
 * unless DB_ALLOW_PRIVATE_ADHOC_URLS=true (explicit "localhost" is allowed by
 * the shared policy). SQLite paths are refused: a file path from the model
 * would be an arbitrary local-file read. Ad-hoc connections are always
 * read-only. Prefer a named connection from DATABASE_URLS.
 */
export async function openAdhoc(url: string): Promise<Driver> {
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1] ?? "";
  const engine = engineForScheme(scheme);
  if (engine === "sqlite") {
    throw new Error(
      "Ad-hoc SQLite URLs are not accepted as tool arguments; configure the file as a named connection in DATABASE_URLS"
    );
  }
  let host: string;
  let port: string;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port;
  } catch {
    throw new Error(`targetDatabaseUrl is not a valid URL: ${redactUrl(url)}`);
  }
  if (!host) throw new Error("targetDatabaseUrl has no host");
  // Validate only host:port — the shared helper echoes the URL in its errors,
  // and this one carries a password.
  await validateUrl(`http://${host}${port ? `:${port}` : ""}/`, { allowPrivate: allowPrivateAdhocUrls() }).catch(
    (e: Error) => {
      throw new Error(
        `${e.message}. Ad-hoc database URLs are guarded against SSRF; configure the database as a named connection in DATABASE_URLS, or set DB_ALLOW_PRIVATE_ADHOC_URLS=true to allow private hosts.`
      );
    }
  );
  const config = buildConnection("ad-hoc", url, true, "ad-hoc");
  return factory(config);
}
