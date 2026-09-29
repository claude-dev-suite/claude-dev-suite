// SPDX-License-Identifier: MIT
/**
 * compare_schemas / generate_migration.
 *
 * Source = `connection` (the database to change). Target = the desired state:
 * a named connection (`targetConnection`, trusted, operator-configured) or an
 * ad-hoc `targetDatabaseUrl` (untrusted tool argument — SSRF-guarded and
 * read-only, see drivers/index.ts). Both sides are read in read-only
 * sessions. Engines must match.
 */

import { ENGINE_LABEL, redactUrl } from "../config.js";
import { getDriver, openAdhoc } from "../drivers/index.js";
import type { Driver } from "../drivers/types.js";
import { describeDiff, diffSnapshots, isEmptyDiff } from "../diff.js";
import { introspectorFor, resolveSchema } from "../introspect/index.js";
import type { SchemaSnapshot } from "../introspect/types.js";
import { buildMigration } from "../migration.js";
import { CompareSchemaSchema, GenerateMigrationSchema, jsonResponse, type Handler } from "./types.js";

interface Sides {
  source: Driver;
  target: Driver;
  targetLabel: string;
  cleanup: () => Promise<void>;
}

async function openSides(args: {
  connection?: string;
  targetConnection?: string;
  targetDatabaseUrl?: string;
}): Promise<Sides> {
  const source = getDriver(args.connection);
  if (args.targetConnection && args.targetDatabaseUrl) throw new Error("Pass targetConnection OR targetDatabaseUrl, not both");
  if (args.targetConnection) {
    const target = getDriver(args.targetConnection);
    return { source, target, targetLabel: `connection "${target.config.name}"`, cleanup: async () => {} };
  }
  if (args.targetDatabaseUrl) {
    const target = await openAdhoc(args.targetDatabaseUrl);
    return { source, target, targetLabel: redactUrl(args.targetDatabaseUrl), cleanup: () => target.close() };
  }
  // same connection, different schema is a valid comparison
  return { source, target: source, targetLabel: `connection "${source.config.name}"`, cleanup: async () => {} };
}

async function snapshots(
  sides: Sides,
  schema: string | undefined,
  targetSchema: string | undefined,
  tables: string[] | undefined
): Promise<{ src: SchemaSnapshot; tgt: SchemaSnapshot }> {
  const { source, target } = sides;
  if (source.engine !== target.engine) {
    throw new Error(
      `Cannot compare ${ENGINE_LABEL[source.engine]} with ${ENGINE_LABEL[target.engine]} — schema diff needs the same engine on both sides`
    );
  }
  const intro = introspectorFor(source.engine);
  const src = await source.withSession("read", async (s) => intro.snapshot(s, await resolveSchema(s, schema), tables));
  const tgt = await target.withSession("read", async (s) =>
    intro.snapshot(s, await resolveSchema(s, targetSchema ?? (target === source ? undefined : schema)), tables)
  );
  if (target === source && src.schema === tgt.schema) {
    throw new Error("Source and target are the same schema on the same connection; pass targetConnection, targetDatabaseUrl or targetSchema");
  }
  return { src, tgt };
}

export const handleCompareSchemas: Handler = async (args) => {
  const a = CompareSchemaSchema.parse(args);
  const sides = await openSides(a);
  try {
    const { src, tgt } = await snapshots(sides, a.schema, a.targetSchema, a.tables);
    const diff = diffSnapshots(src, tgt);
    const described = describeDiff(diff);
    const missingInTarget = [
      ...described.tablesOnlyInSource.map((table) => ({ table })),
      ...diff.tablesChanged.flatMap((c) => c.columnsRemoved.map((col) => ({ table: c.table, column: col.name }))),
    ];
    const missingInSource = [
      ...described.tablesOnlyInTarget.map((table) => ({ table })),
      ...diff.tablesChanged.flatMap((c) => c.columnsAdded.map((col) => ({ table: c.table, column: col.name }))),
    ];
    const typeMismatches = diff.tablesChanged.flatMap((c) =>
      c.columnsChanged.filter((x) => x.changes.includes("type")).map((x) => ({ table: c.table, column: x.name, source: x.source.type, target: x.target.type }))
    );
    return jsonResponse({
      engine: sides.source.engine,
      source: { connection: sides.source.config.name, schema: src.schema, tables: src.tables.length },
      target: { ref: sides.targetLabel, schema: tgt.schema, tables: tgt.tables.length },
      identical: isEmptyDiff(diff),
      compared: ["tables", "views", "columns (type, nullability, default, identity/generated)", "primary keys", "foreign keys", "unique constraints", "check constraints", "indexes", ...(sides.source.engine === "postgres" ? ["enums", "sequences"] : [])],
      differences: { missingInTarget, missingInSource, typeMismatches, ...described },
      ...(src.unavailable.length || tgt.unavailable.length ? { unavailable: [...src.unavailable, ...tgt.unavailable] } : {}),
    });
  } finally {
    await sides.cleanup();
  }
};

export const handleGenerateMigration: Handler = async (args) => {
  const a = GenerateMigrationSchema.parse(args);
  const sides = await openSides(a);
  try {
    const { src, tgt } = await snapshots(sides, a.schema, a.targetSchema, a.tables);
    const engine = sides.source.engine;
    const { upDiff, up, down } = buildMigration(engine, src, tgt, { includeDrops: a.includeDrops });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const name = (a.migrationName || "schema_migration").replace(/[^A-Za-z0-9_-]+/g, "_");
    const header = [
      `-- Migration: ${name}`,
      `-- Engine: ${ENGINE_LABEL[engine]}${engine === "postgres" ? "" : " (best effort — review before applying)"}`,
      `-- Source (changed): connection "${sides.source.config.name}", schema ${src.schema}`,
      `-- Target (desired): ${sides.targetLabel}, schema ${tgt.schema}`,
      `-- includeDrops: ${a.includeDrops}`,
      "",
    ];
    const upSql = up.statements.length ? up.statements.join("\n") : "-- no changes";
    const downSql = down.statements.length ? down.statements.join("\n") : "-- no changes";
    const migration = [
      ...header,
      "-- ==================== UP ====================",
      "",
      upSql,
      "",
      "-- =================== DOWN ===================",
      ...(a.includeDrops ? [] : ["-- (includeDrops=false: DROP statements are omitted here too, so DOWN does not remove what UP created)"]),
      "",
      downSql,
    ].join("\n");
    const count = (xs: string[]) => xs.filter((x) => x && !x.startsWith("--")).length;
    return jsonResponse({
      filename: `${stamp}_${name}.sql`,
      engine,
      identical: isEmptyDiff(upDiff),
      migration,
      up: upSql,
      down: downSql,
      summary: {
        upStatements: count(up.statements),
        downStatements: count(down.statements),
        tablesCreated: upDiff.tablesAdded.length,
        tablesChanged: upDiff.tablesChanged.length,
        tablesDropped: a.includeDrops ? upDiff.tablesRemoved.length : 0,
      },
      warnings: [...new Set(up.warnings)],
      next: "Review, then apply with execute_write (dry run first) on a writable connection.",
    });
  } finally {
    await sides.cleanup();
  }
};
