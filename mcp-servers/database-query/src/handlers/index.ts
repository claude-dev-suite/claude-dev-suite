// SPDX-License-Identifier: MIT
/**
 * Handler registry: tool name -> handler.
 */

import type { Handler } from "./types.js";
import { handleExecuteQuery } from "./execute-query.js";
import { handleExecuteWrite } from "./execute-write.js";
import {
  handleDescribeTable,
  handleGetSchema,
  handleListConnections,
  handleListObjects,
  handleListSchemas,
  handleListTables,
  handlePreviewTable,
  handleSearchObjects,
} from "./schema.js";
import { handleExplainQuery } from "./explain-query.js";
import { handleFindSlowQueries, handleHealthCheck, handleIndexRecommendations } from "./performance.js";
import { handleCompareSchemas, handleGenerateMigration } from "./compare-schemas.js";
import { handleBackupRestore } from "./backup-restore.js";

export type { Handler, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse, formatBytes } from "./types.js";
export * from "./types.js";

export const handlers: Record<string, Handler> = {
  list_connections: handleListConnections,
  execute_query: handleExecuteQuery,
  execute_write: handleExecuteWrite,
  list_schemas: handleListSchemas,
  list_tables: handleListTables,
  describe_table: handleDescribeTable,
  get_schema: handleGetSchema,
  list_objects: handleListObjects,
  search_objects: handleSearchObjects,
  preview_table: handlePreviewTable,
  explain_query: handleExplainQuery,
  find_slow_queries: handleFindSlowQueries,
  index_recommendations: handleIndexRecommendations,
  health_check: handleHealthCheck,
  compare_schemas: handleCompareSchemas,
  generate_migration: handleGenerateMigration,
  backup_restore: handleBackupRestore,
};
