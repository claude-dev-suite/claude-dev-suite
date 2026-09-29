// SPDX-License-Identifier: MIT
import type { Engine } from "../config.js";
import type { Session } from "../drivers/types.js";
import type { Introspector } from "./types.js";
import { postgresIntrospector } from "./postgres.js";
import { mysqlIntrospector } from "./mysql.js";
import { sqliteIntrospector } from "./sqlite.js";

export function introspectorFor(engine: Engine): Introspector {
  switch (engine) {
    case "postgres":
      return postgresIntrospector;
    case "mysql":
      return mysqlIntrospector;
    case "sqlite":
      return sqliteIntrospector;
  }
}

/** The schema a tool should look at: the caller's, else the session default. */
export async function resolveSchema(s: Session, schema: string | undefined): Promise<string> {
  if (schema) return schema;
  const d = await introspectorFor(s.engine).defaultSchema(s);
  if (!d) {
    throw new Error(
      s.engine === "mysql"
        ? "No database selected on this connection (URL has no /database); pass schema"
        : "Could not determine the current schema; pass schema"
    );
  }
  return d;
}
