// SPDX-License-Identifier: MIT
/**
 * Log Analyzer MCP Server
 *
 * Streaming log analysis over files, directories, globs, gzip rotations and
 * live sources (docker, docker compose, kubectl, journald): format
 * auto-detection, multiline exceptions, structured queries, error
 * fingerprinting with baselines, Drain template mining, trace correlation,
 * access-log analytics and file watching with alert rules.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handlers } from "./handlers/index.js";
import { stopAllWatchers } from "./analyzers/watch.js";
import { LOG_FORMATS, LOG_LEVELS } from "./types.js";

const server = new Server(
  {
    name: "log-analyzer-server",
    version: "2.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================
// Shared JSON-schema fragments
// ============================================

const FORMAT = {
  type: "string",
  enum: [...LOG_FORMATS],
  description: "Log format; auto detects per source from its head. custom needs customPattern",
};
const LEVELS = { type: "array", items: { type: "string", enum: LOG_LEVELS } };
const TIME = {
  startTime: { type: "string", description: "Only entries at/after this time (ISO-8601, epoch, or relative like 15m)" },
  endTime: { type: "string", description: "Only entries at/before this time (ISO-8601, epoch, or relative like 15m)" },
};
const LIVE_SOURCE = {
  type: "object",
  description: "Live source read via CLI: docker, compose, kubectl or journald (with tail/since caps)",
  properties: {
    type: { type: "string", enum: ["docker", "compose", "kubectl", "journald"] },
    container: { type: "string", description: "docker: container name/id; kubectl: container in the pod" },
    projectDir: { type: "string", description: "compose: absolute project directory" },
    composeFile: { type: "string", description: "compose: absolute path of the compose file" },
    services: { type: "array", items: { type: "string" }, description: "compose: services to include" },
    namespace: { type: "string" },
    context: { type: "string", description: "kubectl context" },
    pod: { type: "string" },
    deployment: { type: "string" },
    selector: { type: "string", description: "kubectl label selector, e.g. app=api" },
    allContainers: { type: "boolean" },
    previous: { type: "boolean", description: "kubectl: logs of the previous (crashed) container" },
    unit: { type: "string", description: "journald: systemd unit" },
    since: { type: "string", description: "Relative (15m, 2h) or ISO time" },
    tail: { type: "number", description: "Max lines to fetch (default 2000, max 100000)" },
    timeoutSeconds: { type: "number", description: "CLI timeout (default 30, max 180)" },
  },
  required: ["type"],
};
const SOURCE = {
  filePath: { type: "string", description: "Absolute path of a log file, a directory of logs, or a glob (.gz supported)" },
  filePaths: { type: "array", items: { type: "string" }, description: "Several absolute files, directories or globs" },
  source: LIVE_SOURCE,
  format: FORMAT,
  customPattern: { type: "string", description: "Regex with named groups (timestamp, level, message, …) for format custom" },
};

// ============================================
// Tool Registration
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "parse_logs",
      description: "Parse logs into structured entries (multiline exceptions, fields, ids) with filters and paging.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          levels: { ...LEVELS, description: "Only these levels" },
          filter: { type: "string", description: "Regex matched against message or raw line" },
          limit: { type: "number", description: "Entries per page (default 100, max 1000)" },
          offset: { type: "number", description: "Skip this many matching entries (use nextOffset to page)" },
          includeRaw: { type: "boolean", description: "Include the raw text of each entry" },
        },
      },
    },
    {
      name: "find_errors",
      description: "Group errors by fingerprint with first/last seen, causes, timeline; new vs known against a baseline.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          includeWarnings: { type: "boolean", description: "Group warnings too (default false)" },
          limit: { type: "number", description: "Recent errors to return (default 20)" },
          groupLimit: { type: "number", description: "Error groups to return (default 50, max 500)" },
          groupByException: { type: "boolean", description: "Return error groups (default true)" },
          baselineFile: { type: "string", description: "Baseline JSON written earlier via saveBaselineTo" },
          baselinePaths: { type: "array", items: { type: "string" }, description: "Other logs to treat as the baseline" },
          baselineStartTime: { type: "string", description: "Baseline = this time range of the same source (start)" },
          baselineEndTime: { type: "string", description: "Baseline = this time range of the same source (end)" },
          saveBaselineTo: { type: "string", description: "Write the current fingerprints as a baseline JSON (LOG_EXPORT_DIR)" },
          overwrite: { type: "boolean", description: "Allow replacing an existing saveBaselineTo file" },
        },
      },
    },
    {
      name: "analyze_patterns",
      description: "Detect known problem patterns (timeouts, pools, OOM, disk, crashes) with severity and suggestions.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          minOccurrences: { type: "number", description: "Minimum occurrences to report (default 2)" },
          timeWindow: { type: "number", description: "Window in minutes; each pattern reports its busiest window" },
        },
      },
    },
    {
      name: "aggregate_stats",
      description: "Aggregate counts by level, logger and time bucket, error rate, peak and quiet periods.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          groupBy: { type: "string", enum: ["minute", "hour", "day"], description: "Time bucket (default hour)" },
        },
      },
    },
    {
      name: "correlate_events",
      description: "Chain events across files/services by request, trace, span, session, user or custom id.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          correlationField: { type: "string", enum: ["requestId", "traceId", "spanId", "sessionId", "userId", "custom"] },
          customField: { type: "string", description: "Field name (dotted path allowed) when correlationField is custom" },
          targetValue: { type: "string", description: "Only this correlation value" },
          limit: { type: "number", description: "Chains to return (default 20)" },
          eventsPerChain: { type: "number", description: "Events per chain (default 20)" },
        },
        required: ["correlationField"],
      },
    },
    {
      name: "tail_logs",
      description: "Last N entries of a log, read from the end of the file; filter by level or regex.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          lines: { type: "number", description: "Entries to return (default 50, max 1000)" },
          filter: { type: "string", description: "Regex matched against message or raw line" },
          levels: { ...LEVELS, description: "Only these levels" },
        },
      },
    },
    {
      name: "search_logs",
      description: "Grep across files, directories, globs, .gz and live sources with context lines.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          query: { type: "string", description: "Text or regex to find" },
          caseSensitive: { type: "boolean", description: "Case-sensitive (default false)" },
          useRegex: { type: "boolean", description: "Treat query as a regex (default false)" },
          invert: { type: "boolean", description: "Return lines that do NOT match" },
          context: { type: "number", description: "Context lines before/after (default 0, max 20)" },
          limit: { type: "number", description: "Matches to return (default 100, max 1000)" },
        },
        required: ["query"],
      },
    },
    {
      name: "compare_logs",
      description: "Compare two logs (e.g. before/after deploy) by level, pattern, time, error fingerprints or templates.",
      inputSchema: {
        type: "object",
        properties: {
          baselineFile: { type: "string", description: "Baseline file, directory or glob" },
          comparisonFile: { type: "string", description: "Comparison file, directory or glob" },
          format: FORMAT,
          customPattern: SOURCE.customPattern,
          compareBy: { type: "string", enum: ["level", "pattern", "time", "errors", "templates"], description: "Default level" },
        },
        required: ["baselineFile", "comparisonFile"],
      },
    },
    {
      name: "export_report",
      description: "Write an HTML, JSON or Markdown analysis report (stats, errors, patterns) to disk.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          outputFormat: { type: "string", enum: ["html", "json", "markdown"] },
          outputPath: { type: "string", description: "Absolute output path; default LOG_EXPORT_DIR or next to the log" },
          includeCharts: { type: "boolean", description: "ASCII charts (default true)" },
          title: { type: "string" },
          overwrite: { type: "boolean", description: "Allow replacing an existing file (default false)" },
        },
        required: ["outputFormat"],
      },
    },
    {
      name: "watch_logs",
      description: "Follow a log file (rotation-safe, multiline) with alert rules; start, status, stop or list.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["start", "status", "stop", "list"] },
          filePath: { type: "string", description: "Absolute file path (start/status/stop); may not exist yet" },
          format: FORMAT,
          customPattern: SOURCE.customPattern,
          filter: { type: "string", description: "Regex; only matching entries are kept" },
          levels: { ...LEVELS, description: "Only these levels are kept" },
          alertPatterns: { type: "array", items: { type: "string" }, description: "Regexes that raise an alert per match" },
          alertLevels: { ...LEVELS, description: "Levels that raise an alert (default ERROR, FATAL)" },
          alertRules: {
            type: "array",
            description: "Rules: pattern and/or levels, alert when threshold matches occur within windowSeconds",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                pattern: { type: "string" },
                levels: LEVELS,
                threshold: { type: "number" },
                windowSeconds: { type: "number" },
              },
            },
          },
          pollInterval: { type: "number", description: "Poll interval ms (default 1000)" },
          maxEntries: { type: "number", description: "Entries kept in memory (default 1000, max 5000)" },
          fromStart: { type: "boolean", description: "Read the existing content too (default: only new lines)" },
          limit: { type: "number", description: "status: recent entries to return (default 50)" },
        },
        required: ["action"],
      },
    },
    {
      name: "query_logs",
      description: "Filter, group, count over time, top-k and percentiles on any field (LogQL-lite or JSON query).",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          query: {
            type: "string",
            description: 'e.g. level>=ERROR and path=~"^/api" | count by (path) | top 10; percentiles(durationMs) by (path)',
          },
          where: {
            type: "array",
            description: "AND conditions: {field, op, value}; ops = != =~ !~ > >= < <= contains !contains exists in",
            items: {
              type: "object",
              properties: { field: { type: "string" }, op: { type: "string" }, value: {} },
              required: ["field", "op"],
            },
          },
          text: { type: "array", items: { type: "string" }, description: "Raw line must contain each (case-insensitive)" },
          groupBy: { type: "array", items: { type: "string" }, description: "Fields to group by" },
          aggregate: {
            type: "object",
            description: "count, sum, avg, min, max, percentiles or count_distinct over field",
            properties: {
              op: { type: "string", enum: ["count", "sum", "avg", "min", "max", "percentiles", "count_distinct"] },
              field: { type: "string" },
              percentiles: { type: "array", items: { type: "number" } },
            },
            required: ["op"],
          },
          bucket: { type: "string", description: "Count-over-time bucket, e.g. 1m, 5m, 1h" },
          topK: { type: "number", description: "Keep the K largest groups" },
          limit: { type: "number", description: "Entries mode: max entries (default 50, max 500)" },
          newest: { type: "boolean", description: "Entries mode: return the newest instead of the oldest" },
        },
      },
    },
    {
      name: "mine_templates",
      description: "Cluster log messages into templates (Drain) with counts, levels and first/last seen.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          levels: { ...LEVELS, description: "Only these levels" },
          filter: { type: "string", description: "Regex matched against message or raw line" },
          similarity: { type: "number", description: "Drain similarity threshold 0.1-1 (default 0.4)" },
          depth: { type: "number", description: "Drain tree depth 3-8 (default 4)" },
          limit: { type: "number", description: "Templates to return (default 50, max 500)" },
          minCount: { type: "number", description: "Hide templates seen fewer times" },
        },
      },
    },
    {
      name: "access_log_stats",
      description: "HTTP access analytics: status classes, error rate over time, p50/p95/p99 per endpoint, top IPs/UAs.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          bucket: { type: "string", description: "Error-rate bucket (default 5m)" },
          top: { type: "number", description: "Rows per top list (default 10)" },
          normalizePaths: { type: "boolean", description: "Collapse ids in paths, /users/{id} (default true)" },
          minRequests: { type: "number", description: "Ignore endpoints with fewer requests" },
        },
      },
    },
    {
      name: "trace_timeline",
      description: "Timeline of one trace or request id across files/services, with the span tree when logged.",
      inputSchema: {
        type: "object",
        properties: {
          ...SOURCE,
          ...TIME,
          id: { type: "string", description: "Trace id, request id or other correlation value" },
          field: { type: "string", description: "Field to match (default traceId, then requestId)" },
          limit: { type: "number", description: "Timeline entries to return (default 200)" },
        },
        required: ["id"],
      },
    },
    {
      name: "detect_format",
      description: "Detect each source's log format and envelope with confidence and sample parsed entries.",
      inputSchema: {
        type: "object",
        properties: { ...SOURCE },
      },
    },
  ],
}));

// ============================================
// Tool dispatch
// ============================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const handler = handlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return await handler(args ?? {});
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
      const issues = (error as { issues: Array<{ path: unknown[]; message: string }> }).issues;
      message = `Invalid arguments: ${issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`;
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message, tool: name }) }],
      isError: true,
    };
  }
});

// ============================================
// Startup and shutdown
// ============================================

let shuttingDown = false;
async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await stopAllWatchers();
    await server.close();
  } catch {
    // exiting anyway
  }
  process.exit(code);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The old handlers only stopped watchers and never exited, so a signal left
  // the process running; a closed stdin (client gone) also has to end it.
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  process.stdin.on("end", () => void shutdown(0));
  process.stdin.on("close", () => void shutdown(0));
  console.error("Log Analyzer MCP Server v2.3.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
