// SPDX-License-Identifier: MIT
/**
 * Handler plumbing and input schemas.
 */

import { z } from "zod";

export interface HandlerResult {
  [key: string]: unknown; // index signature for MCP SDK compatibility
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

export function jsonResponse(data: unknown): HandlerResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResponse(message: string, extra: Record<string, unknown> = {}): HandlerResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message, ...extra }) }], isError: true };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// Input schemas (the ListTools JSON schemas are generated from these)
// ---------------------------------------------------------------------------

const connection = z
  .string()
  .optional()
  .describe('Named connection (see list_connections). Defaults to "default" / the only one configured.');
const schema = z.string().optional().describe("Schema (Postgres), database (MySQL) or attached db (SQLite). Default: current.");
const limit = (def: number, max: number) =>
  z.number().int().min(1).max(max).optional().default(def).describe(`Max items to return (default ${def}, max ${max})`);

export const ListConnectionsSchema = z.object({});

export const QuerySchema = z.object({
  sql: z.string().min(1).describe("One read-only statement (SELECT, WITH, VALUES, SHOW, …). Use $1/? placeholders."),
  params: z.array(z.unknown()).optional().describe("Bind parameters"),
  limit: z.number().int().min(1).optional().describe("Max rows to return (default 1000; hard cap DB_MAX_ROWS)"),
  offset: z.number().int().min(0).optional().default(0).describe("Rows to skip, for paging"),
  includeTotalCount: z.boolean().optional().default(false).describe("Also run COUNT(*) over the query (costs a second execution)"),
  maxCellChars: z.number().int().min(16).max(100000).optional().default(2000).describe("Truncate longer text/JSON cells"),
  connection,
});

export const WriteSchema = z.object({
  sql: z.string().min(1).describe("Statement(s) to run in ONE transaction. Several statements need no params."),
  params: z.array(z.unknown()).optional().describe("Bind parameters (single statement only)"),
  confirm: z.boolean().optional().default(false).describe("Must be true to execute; otherwise a dry run is returned"),
  connection,
});

export const ListSchemasSchema = z.object({ connection });

export const ListTablesSchema = z.object({
  schema,
  includeViews: z.boolean().optional().default(true).describe("Include views and materialized views"),
  limit: limit(500, 5000),
  connection,
});

export const TableInfoSchema = z.object({
  table: z.string().min(1).describe("Table or view name"),
  schema,
  connection,
});

export const SchemaIntrospectionSchema = z.object({
  table: z.string().optional().describe("Only this table"),
  schema,
  compact: z.boolean().optional().default(false).describe("Only table and column names"),
  limit: limit(100, 1000).describe("Max tables (default 100)"),
  connection,
});

export const ListObjectsSchema = z.object({
  kind: z
    .enum(["enum", "type", "function", "procedure", "trigger", "sequence", "view", "materialized_view", "index", "extension"])
    .describe("Object kind to list"),
  schema,
  limit: limit(200, 5000),
  connection,
});

export const SearchObjectsSchema = z.object({
  pattern: z.string().min(1).max(200).describe("Case-insensitive substring to find in object and column names"),
  schema: z.string().optional().describe("Restrict to one schema (default: all user schemas)"),
  limit: limit(50, 500),
  connection,
});

export const PreviewTableSchema = z.object({
  table: z.string().min(1).describe("Table or view name"),
  schema,
  columns: z.array(z.string()).optional().describe("Columns to return (default all)"),
  orderBy: z.string().optional().describe("Column to sort by"),
  descending: z.boolean().optional().default(false),
  limit: limit(20, 500),
  maxCellChars: z.number().int().min(16).max(100000).optional().default(500),
  connection,
});

export const ExplainQuerySchema = z.object({
  sql: z.string().min(1).describe("Read-only statement to explain"),
  params: z.array(z.unknown()).optional().describe("Bind parameters"),
  analyze: z
    .boolean()
    .optional()
    .default(false)
    .describe("EXECUTE the query for real timings (read-only txn, rolled back). Default false."),
  verbose: z.boolean().optional().default(false).describe("Postgres VERBOSE"),
  format: z.enum(["text", "json"]).optional().default("json").describe("Plan format"),
  connection,
});

export const FindSlowQueriesSchema = z.object({
  table: z.string().optional().describe("Only statements mentioning / stats for this table"),
  orderBy: z.enum(["total_time", "mean_time", "calls", "rows"]).optional().default("total_time"),
  limit: limit(20, 200),
  connection,
});

export const IndexRecommendationsSchema = z.object({
  schema,
  connection,
});

export const HealthCheckSchema = z.object({
  longRunningSeconds: z.number().min(1).optional().default(60).describe("Report queries running longer than this"),
  connection,
});

export const CompareSchemaSchema = z.object({
  targetConnection: z.string().optional().describe("Named connection holding the other schema (preferred)"),
  targetDatabaseUrl: z.string().optional().describe("Ad-hoc URL of the other database (SSRF-guarded, read-only)"),
  schema,
  targetSchema: z.string().optional().describe("Schema on the target side (default: same as schema / target default)"),
  tables: z.array(z.string()).optional().describe("Only these tables"),
  connection,
});

export const GenerateMigrationSchema = CompareSchemaSchema.extend({
  migrationName: z.string().optional().describe("Name used in the suggested filename"),
  includeDrops: z.boolean().optional().default(false).describe("Emit DROP for objects missing from the target (up AND down)"),
});

export const BackupRestoreSchema = z.object({
  operation: z.enum(["backup", "restore", "list"]).describe("backup, restore (needs confirm) or list"),
  backupPath: z.string().optional().describe("File (or dir for list) — relative to DB_BACKUP_DIR, or absolute inside it"),
  format: z.enum(["custom", "plain", "directory"]).optional().default("custom").describe("Postgres dump format"),
  tables: z.array(z.string()).optional().describe("Only these tables"),
  schemaOnly: z.boolean().optional().default(false),
  dataOnly: z.boolean().optional().default(false),
  clean: z.boolean().optional().default(false).describe("restore: drop objects before recreating them"),
  confirm: z.boolean().optional().default(false).describe("restore: must be true to execute; otherwise dry run"),
  limit: limit(100, 1000),
  connection,
});
