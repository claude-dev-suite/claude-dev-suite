// SPDX-License-Identifier: MIT
/**
 * Log Analyzer MCP Server
 * Provides log parsing, error finding, pattern detection, and event correlation
 * for Node.js, Java, and Python applications
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handlers } from "./handlers/index.js";

// ============================================
// Server Setup
// ============================================

const server = new Server(
  {
    name: "log-analyzer-server",
    version: "2.2.0", // Bump for handler refactoring
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================
// Tool Registration
// ============================================

const LOG_FORMATS = ['spring-boot', 'log4j', 'logback', 'winston', 'pino', 'morgan', 'python', 'json', 'clf', 'nginx', 'apache', 'kubernetes', 'syslog', 'auto'];
const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "parse_logs",
      description:
        "Parse a log file into structured entries. Auto-detects Spring Boot, Winston/Pino, Python and JSON formats.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to the log file" },
          format: { type: "string", enum: LOG_FORMATS, description: "Log format (auto-detected if not specified)" },
          startTime: { type: "string", description: "Filter logs after this time (ISO format)" },
          endTime: { type: "string", description: "Filter logs before this time (ISO format)" },
          levels: { type: "array", items: { type: "string", enum: LOG_LEVELS }, description: "Filter by log levels" },
          limit: { type: "number", description: "Maximum entries to return (default: 1000)" },
          filter: { type: "string", description: "Regex pattern to filter messages" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "find_errors",
      description:
        "Group a log file's errors by exception type, with the recent errors and an hourly timeline.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to the log file" },
          format: { type: "string", enum: LOG_FORMATS },
          includeWarnings: { type: "boolean", description: "Include warnings in results (default: false)" },
          limit: { type: "number", description: "Maximum recent errors to return (default: 100)" },
          groupByException: { type: "boolean", description: "Group errors by exception type (default: true)" },
          startTime: { type: "string", description: "Filter logs after this time (ISO format)" },
          endTime: { type: "string", description: "Filter logs before this time (ISO format)" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "analyze_patterns",
      description:
        "Detect problem patterns in logs (timeouts, connection, memory) with severity, suggestions and examples.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to the log file" },
          format: { type: "string", enum: LOG_FORMATS },
          minOccurrences: { type: "number", description: "Minimum occurrences to report a pattern (default: 2)" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "aggregate_stats",
      description:
        "Aggregate log statistics: entries by level, by logger, hourly distribution, error rates, peak/quiet hours.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to the log file" },
          format: { type: "string", enum: LOG_FORMATS },
          groupBy: { type: "string", enum: ['hour', 'minute', 'day'], description: "Time grouping (default: hour)" },
          startTime: { type: "string", description: "Start of time range (ISO format)" },
          endTime: { type: "string", description: "End of time range (ISO format)" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "correlate_events",
      description:
        "Correlate events across several log files by request ID, trace ID or a custom field.",
      inputSchema: {
        type: "object",
        properties: {
          filePaths: { type: "array", items: { type: "string" }, description: "Array of log file paths to correlate" },
          correlationField: { type: "string", enum: ['requestId', 'traceId', 'sessionId', 'userId', 'custom'], description: "Field to use for correlation" },
          customField: { type: "string", description: "Custom field name if correlationField is 'custom'" },
          targetValue: { type: "string", description: "Search for a specific correlation value" },
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
        required: ["filePaths", "correlationField"],
      },
    },
    {
      name: "tail_logs",
      description:
        "Get the last N lines of a log file, optionally filtered by level or pattern.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute path to the log file" },
          format: { type: "string", enum: LOG_FORMATS },
          lines: { type: "number", description: "Number of lines to return (default: 50)" },
          filter: { type: "string", description: "Regex pattern to filter" },
          levels: { type: "array", items: { type: "string", enum: LOG_LEVELS }, description: "Filter by log levels" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "search_logs",
      description:
        "Search for text or patterns across multiple log files. Returns matching lines with context.",
      inputSchema: {
        type: "object",
        properties: {
          filePaths: { type: "array", items: { type: "string" }, description: "Array of log file paths to search" },
          query: { type: "string", description: "Search query (text or regex pattern)" },
          caseSensitive: { type: "boolean", description: "Case-sensitive search (default: false)" },
          useRegex: { type: "boolean", description: "Interpret query as regex (default: false)" },
          context: { type: "number", description: "Lines of context around each match (default: 0)" },
          limit: { type: "number", description: "Maximum matches to return (default: 100)" },
          format: { type: "string", enum: LOG_FORMATS },
        },
        required: ["filePaths", "query"],
      },
    },
    {
      name: "compare_logs",
      description:
        "Compare two log files and highlight differences in error rates, patterns, and log distributions.",
      inputSchema: {
        type: "object",
        properties: {
          baselineFile: { type: "string", description: "Path to baseline log file" },
          comparisonFile: { type: "string", description: "Path to comparison log file" },
          format: { type: "string", enum: LOG_FORMATS },
          compareBy: { type: "string", enum: ['level', 'pattern', 'time'], description: "Comparison method (default: level)" },
        },
        required: ["baselineFile", "comparisonFile"],
      },
    },
    {
      name: "export_report",
      description:
        "Generate a comprehensive log analysis report in HTML, JSON, or Markdown format.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to log file to analyze" },
          format: { type: "string", enum: LOG_FORMATS },
          outputFormat: { type: "string", enum: ['html', 'json', 'markdown'], description: "Output format for the report" },
          outputPath: { type: "string", description: "Output file path (defaults to input path with new extension)" },
          includeCharts: { type: "boolean", description: "Include ASCII charts in report (default: true)" },
          title: { type: "string", description: "Report title" },
        },
        required: ["filePath", "outputFormat"],
      },
    },
    {
      name: "watch_logs",
      description:
        "Watch a log file in real time and alert on errors or custom patterns.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["start", "status", "stop", "list"], description: "Action: start watching, get status, stop watching, or list active watchers" },
          filePath: { type: "string", description: "Path to log file (required for start/status/stop)" },
          format: { type: "string", enum: LOG_FORMATS },
          filter: { type: "string", description: "Regex pattern to filter log entries" },
          levels: { type: "array", items: { type: "string", enum: LOG_LEVELS }, description: "Filter by log levels" },
          alertPatterns: { type: "array", items: { type: "string" }, description: "Regex patterns that trigger alerts" },
          alertLevels: { type: "array", items: { type: "string", enum: LOG_LEVELS }, description: "Log levels that trigger alerts (default: ERROR, FATAL)" },
          pollInterval: { type: "number", description: "Polling interval in ms (default: 1000)" },
        },
        required: ["action"],
      },
    },
  ],
}));

// ============================================
// Tool Handler using registry
// ============================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const handler = handlers[name];

    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return await handler(args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage, tool: name }),
      }],
      isError: true,
    };
  }
});

// ============================================
// Server Startup
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Log Analyzer MCP Server v2.2.0 running on stdio");
  console.error("Supported formats: Spring Boot, Winston, Pino, Python, JSON, Nginx, Apache, Kubernetes, Syslog");
  console.error("Features: Real-time watching, search, compare, export reports");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
