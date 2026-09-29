// SPDX-License-Identifier: MIT
/**
 * Database Query MCP Server
 *
 * PostgreSQL, MySQL/MariaDB and SQLite: read-only querying, introspection,
 * plans, performance/health diagnostics, schema diff + migrations, backups.
 * Connections come from DATABASE_URL / DATABASE_URLS and are read-only unless
 * the operator marks them writable. MongoDB is out of scope.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { closeAll } from "./drivers/index.js";
import {
  BackupRestoreSchema,
  CompareSchemaSchema,
  ExplainQuerySchema,
  FindSlowQueriesSchema,
  GenerateMigrationSchema,
  HealthCheckSchema,
  IndexRecommendationsSchema,
  ListConnectionsSchema,
  ListObjectsSchema,
  ListSchemasSchema,
  ListTablesSchema,
  PreviewTableSchema,
  QuerySchema,
  SchemaIntrospectionSchema,
  SearchObjectsSchema,
  TableInfoSchema,
  WriteSchema,
} from "./handlers/index.js";
import { callTool } from "./handlers/dispatch.js";

const server = new Server(
  {
    name: "database-query-server",
    version: "2.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function schema(s: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Tool list. Engine support per tool is reported by list_connections (toolEngines). */
const TOOLS = [
  {
    name: "execute_query",
    description: "Run one read-only SQL statement (engine-enforced read-only txn, timeout, row cap + paging). PG, MySQL, SQLite",
    inputSchema: schema(QuerySchema),
  },
  {
    name: "list_tables",
    description: "List tables, views and materialized views in a schema with row estimates, sizes and comments",
    inputSchema: schema(ListTablesSchema),
  },
  {
    name: "describe_table",
    description: "Full table definition: columns, PK, FKs (composite), unique/check constraints, indexes, triggers",
    inputSchema: schema(TableInfoSchema),
  },
  {
    name: "get_schema",
    description: "Schema overview of all tables (or one): columns, keys, indexes, enums. compact=true for names only",
    inputSchema: schema(SchemaIntrospectionSchema),
  },
  {
    name: "explain_query",
    description: "Show a query plan with a summary (full scans, misestimates). analyze=true executes it in a rolled-back txn",
    inputSchema: schema(ExplainQuerySchema),
  },
  {
    name: "find_slow_queries",
    description: "Top queries by time from pg_stat_statements (Postgres) or performance_schema (MySQL), plus scan stats",
    inputSchema: schema(FindSlowQueriesSchema),
  },
  {
    name: "compare_schemas",
    description: "Diff two schemas: tables, columns, types, nullability, defaults, keys, constraints, indexes, enums",
    inputSchema: schema(CompareSchemaSchema),
  },
  {
    name: "generate_migration",
    description: "Generate up/down migration SQL from a schema diff (Postgres first-class; MySQL/SQLite best effort)",
    inputSchema: schema(GenerateMigrationSchema),
  },
  {
    name: "backup_restore",
    description: "Backup, list or restore (confirm required) via pg_dump/pg_restore, mysqldump or SQLite VACUUM INTO",
    inputSchema: schema(BackupRestoreSchema),
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, request.params.arguments));

async function shutdown() {
  await closeAll();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Database Query MCP Server running on stdio");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
