// SPDX-License-Identifier: MIT
/**
 * Database Query MCP Server
 *
 * Provides PostgreSQL database introspection and query capabilities.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handlers, closePool } from "./handlers/index.js";

const server = new Server(
  {
    name: "database-query-server",
    version: "2.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_query",
      description:
        "Execute a SELECT query on the database. Only SELECT queries are allowed for safety. Results are limited by default (1000 rows). Use limit/offset for pagination.",
      inputSchema: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "SQL SELECT query to execute",
          },
          params: {
            type: "array",
            description: "Query parameters for prepared statement",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default: 1000, max: 10000)",
            default: 1000,
          },
          offset: {
            type: "number",
            description: "Row offset for pagination (default: 0)",
            default: 0,
          },
        },
        required: ["sql"],
      },
    },
    {
      name: "list_tables",
      description: "List all tables in the database with their row counts",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "describe_table",
      description: "Get detailed schema information for a specific table",
      inputSchema: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description: "Table name to describe",
          },
        },
        required: ["table"],
      },
    },
    {
      name: "get_schema",
      description: "Get the database schema (tables, columns). Use compact=true for minimal output.",
      inputSchema: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description: "Optional: specific table name",
          },
          compact: {
            type: "boolean",
            description: "Return compact output (only table and column names, no types/defaults)",
            default: false,
          },
        },
      },
    },
    {
      name: "explain_query",
      description: "Run EXPLAIN ANALYZE on a query to understand performance and get index suggestions",
      inputSchema: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "SQL SELECT query to analyze",
          },
          params: {
            type: "array",
            description: "Query parameters for prepared statement",
          },
          verbose: {
            type: "boolean",
            description: "Include verbose output with more details",
            default: false,
          },
          format: {
            type: "string",
            enum: ["text", "json"],
            description: "Output format",
            default: "json",
          },
        },
        required: ["sql"],
      },
    },
    {
      name: "compare_schemas",
      description: "Compare database schema with another database or a reference schema. Shows differences in tables, columns, indexes.",
      inputSchema: {
        type: "object",
        properties: {
          targetDatabaseUrl: {
            type: "string",
            description: "Connection string for the target database to compare against",
          },
          tables: {
            type: "array",
            items: { type: "string" },
            description: "Optional: specific tables to compare (all if omitted)",
          },
        },
        required: ["targetDatabaseUrl"],
      },
    },
    {
      name: "find_slow_queries",
      description: "Find potentially slow queries by analyzing table statistics and missing indexes",
      inputSchema: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description: "Optional: analyze specific table",
          },
        },
      },
    },
    {
      name: "generate_migration",
      description: "Generate SQL migration script from schema differences between two databases or from a schema comparison",
      inputSchema: {
        type: "object",
        properties: {
          targetDatabaseUrl: {
            type: "string",
            description: "Connection string for the target database (the desired state)",
          },
          migrationName: {
            type: "string",
            description: "Name for the migration file",
          },
          tables: {
            type: "array",
            items: { type: "string" },
            description: "Optional: specific tables to include in migration",
          },
          includeDrops: {
            type: "boolean",
            description: "Include DROP statements for removed columns/tables (default: false)",
            default: false,
          },
        },
        required: ["targetDatabaseUrl"],
      },
    },
    {
      name: "backup_restore",
      description: "Backup or restore database using pg_dump/pg_restore. Supports custom format for efficient storage.",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["backup", "restore", "list"],
            description: "Operation to perform: backup, restore, or list available backups",
          },
          backupPath: {
            type: "string",
            description: "Path for backup file (for backup/restore operations)",
          },
          format: {
            type: "string",
            enum: ["custom", "plain", "directory"],
            description: "Backup format: custom (compressed), plain (SQL), directory",
            default: "custom",
          },
          tables: {
            type: "array",
            items: { type: "string" },
            description: "Optional: specific tables to backup/restore",
          },
          schemaOnly: {
            type: "boolean",
            description: "Backup schema only, no data (default: false)",
            default: false,
          },
          dataOnly: {
            type: "boolean",
            description: "Backup data only, no schema (default: false)",
            default: false,
          },
        },
        required: ["operation"],
      },
    },
  ],
}));

// Handle tool calls using handlers registry
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = handlers[name];
  if (!handler) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
      isError: true,
    };
  }

  try {
    return await handler(args);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Database Query MCP Server running on stdio");
}

main().catch(console.error);
