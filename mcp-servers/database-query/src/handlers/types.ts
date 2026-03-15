// SPDX-License-Identifier: MIT
/**
 * Types and schemas for database-query handlers
 */

import { z } from "zod";

// ============================================
// Handler Types
// ============================================

export interface HandlerResult {
  [key: string]: unknown; // Index signature for MCP SDK compatibility
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

// ============================================
// Response Helpers
// ============================================

export function jsonResponse(data: unknown): HandlerResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResponse(message: string): HandlerResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true,
  };
}

// ============================================
// Utility Functions
// ============================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================
// Input Schemas
// ============================================

export const QuerySchema = z.object({
  sql: z.string().describe("SQL query to execute (SELECT only for safety)"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
  limit: z.number().min(1).max(10000).optional().default(1000).describe("Max rows to return (default: 1000, max: 10000)"),
  offset: z.number().min(0).optional().default(0).describe("Row offset for pagination"),
});

export const SchemaIntrospectionSchema = z.object({
  table: z.string().optional().describe("Specific table name, or empty for all"),
  compact: z.boolean().optional().default(false).describe("Return compact output (only table and column names)"),
});

export const TableInfoSchema = z.object({
  table: z.string().describe("Table name to get detailed info"),
});

export const ExplainQuerySchema = z.object({
  sql: z.string().describe("SQL SELECT query to analyze"),
  params: z.array(z.unknown()).optional().describe("Query parameters"),
  verbose: z.boolean().optional().default(false).describe("Include verbose output"),
  format: z.enum(["text", "json"]).optional().default("json").describe("Output format"),
});

export const CompareSchemaSchema = z.object({
  targetDatabaseUrl: z.string().describe("Connection string for the target database"),
  tables: z.array(z.string()).optional().describe("Specific tables to compare"),
});

export const FindSlowQueriesSchema = z.object({
  table: z.string().optional().describe("Specific table to analyze"),
});

export const GenerateMigrationSchema = z.object({
  targetDatabaseUrl: z.string().describe("Connection string for the target database"),
  migrationName: z.string().optional().describe("Name for the migration file"),
  tables: z.array(z.string()).optional().describe("Specific tables to include"),
  includeDrops: z.boolean().optional().default(false).describe("Include DROP statements"),
});

export const BackupRestoreSchema = z.object({
  operation: z.enum(["backup", "restore", "list"]).describe("Operation to perform"),
  backupPath: z.string().optional().describe("Path for backup file"),
  format: z.enum(["custom", "plain", "directory"]).optional().default("custom").describe("Backup format"),
  tables: z.array(z.string()).optional().describe("Specific tables"),
  schemaOnly: z.boolean().optional().default(false).describe("Schema only"),
  dataOnly: z.boolean().optional().default(false).describe("Data only"),
});
