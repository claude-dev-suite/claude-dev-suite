// SPDX-License-Identifier: MIT
/**
 * Which engines each tool supports. Tools check this before touching the
 * database and return "not supported on <engine>" otherwise.
 */

import type { Engine } from "./config.js";

const ALL: readonly Engine[] = ["postgres", "mysql", "sqlite"];

export const TOOL_ENGINES: Record<string, readonly Engine[]> = {
  list_connections: ALL,
  execute_query: ALL,
  execute_write: ALL,
  list_schemas: ALL,
  list_tables: ALL,
  describe_table: ALL,
  get_schema: ALL,
  list_objects: ALL,
  search_objects: ALL,
  preview_table: ALL,
  explain_query: ALL,
  find_slow_queries: ["postgres", "mysql"],
  index_recommendations: ALL,
  health_check: ALL,
  compare_schemas: ALL,
  generate_migration: ALL,
  backup_restore: ALL,
};
