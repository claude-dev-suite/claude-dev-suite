// SPDX-License-Identifier: MIT
/**
 * Database Query handlers registry
 */

// Type exports
export type { Handler, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse, formatBytes } from "./types.js";

// Schema exports
export {
  QuerySchema,
  SchemaIntrospectionSchema,
  TableInfoSchema,
  ExplainQuerySchema,
  CompareSchemaSchema,
  FindSlowQueriesSchema,
  GenerateMigrationSchema,
  BackupRestoreSchema,
} from "./types.js";

// DB utilities
export { getPool, closePool, getConnectionString, parseConnectionEnv } from "./db.js";

// Handler imports
import type { Handler } from "./types.js";
import { handleExecuteQuery } from "./execute-query.js";
import { handleListTables, handleDescribeTable, handleGetSchema } from "./schema.js";
import { handleExplainQuery } from "./explain-query.js";
import { handleCompareSchemas } from "./compare-schemas.js";
import { handleFindSlowQueries } from "./find-slow-queries.js";
import { handleGenerateMigration } from "./generate-migration.js";
import { handleBackupRestore } from "./backup-restore.js";

// Handler exports
export { handleExecuteQuery } from "./execute-query.js";
export { handleListTables, handleDescribeTable, handleGetSchema } from "./schema.js";
export { handleExplainQuery } from "./explain-query.js";
export { handleCompareSchemas } from "./compare-schemas.js";
export { handleFindSlowQueries } from "./find-slow-queries.js";
export { handleGenerateMigration } from "./generate-migration.js";
export { handleBackupRestore } from "./backup-restore.js";

/**
 * Handler registry - maps tool names to their handlers
 */
export const handlers: Record<string, Handler> = {
  execute_query: handleExecuteQuery,
  list_tables: handleListTables,
  describe_table: handleDescribeTable,
  get_schema: handleGetSchema,
  explain_query: handleExplainQuery,
  compare_schemas: handleCompareSchemas,
  find_slow_queries: handleFindSlowQueries,
  generate_migration: handleGenerateMigration,
  backup_restore: handleBackupRestore,
};
