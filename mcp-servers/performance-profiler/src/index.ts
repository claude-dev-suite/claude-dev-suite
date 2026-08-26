// SPDX-License-Identifier: MIT
/**
 * Performance Profiler MCP Server
 * Provides CPU profiling, memory analysis, and benchmarking tools
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
    name: "performance-profiler-server",
    version: "2.3.0", // Bump for handler refactoring
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

const RUNTIMES = ["nodejs", "java", "python"] as const;
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ============================================
    // Script Profiling Tools
    // ============================================
    {
      name: "profile_script",
      description:
        "Profile a Node.js, Java (JAR) or Python script for CPU: top functions by time, call counts, summary.",
      inputSchema: {
        type: "object",
        properties: {
          scriptPath: { type: "string", description: "Absolute path to the script/jar/module to profile" },
          runtime: { type: "string", enum: RUNTIMES, description: "Runtime to use (auto-detected from file extension if not specified)" },
          args: { type: "array", items: { type: "string" }, description: "Arguments to pass to the script" },
          duration: { type: "number", description: "Duration of profiling in seconds (default: 10)", default: 10 },
        },
        required: ["scriptPath"],
      },
    },
    {
      name: "profile_function",
      description:
        "Profile a function over repeated runs: mean, median, min, max, stdDev, and memory usage.",
      inputSchema: {
        type: "object",
        properties: {
          modulePath: { type: "string", description: "Absolute path to the module/class containing the function" },
          functionName: { type: "string", description: "Name of the function to profile" },
          args: { type: "array", description: "Arguments to pass to the function" },
          iterations: { type: "number", description: "Number of iterations to run (default: 100)", default: 100 },
          runtime: { type: "string", enum: RUNTIMES, description: "Runtime to use" },
        },
        required: ["modulePath", "functionName", "runtime"],
      },
    },
    {
      name: "benchmark_code",
      description:
        "Benchmark a code snippet over repeated runs: mean, median, ops/second and percentiles.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code snippet to benchmark" },
          runtime: { type: "string", enum: RUNTIMES, description: "Runtime to use" },
          iterations: { type: "number", description: "Number of iterations (default: 1000)", default: 1000 },
          warmup: { type: "number", description: "Number of warmup iterations (default: 100)", default: 100 },
        },
        required: ["code", "runtime"],
      },
    },
    {
      name: "analyze_memory",
      description:
        "Analyze memory usage of a script over time. Takes periodic snapshots and detects potential memory leaks.",
      inputSchema: {
        type: "object",
        properties: {
          scriptPath: { type: "string", description: "Absolute path to the script to analyze" },
          runtime: { type: "string", enum: RUNTIMES, description: "Runtime to use (auto-detected if not specified)" },
          snapshotInterval: { type: "number", description: "Interval between memory snapshots in ms (default: 1000)", default: 1000 },
          duration: { type: "number", description: "Duration of analysis in seconds (default: 10)", default: 10 },
        },
        required: ["scriptPath"],
      },
    },
    {
      name: "measure_startup",
      description:
        "Measure the startup time of an application. Runs multiple times to get accurate cold and warm start measurements.",
      inputSchema: {
        type: "object",
        properties: {
          scriptPath: { type: "string", description: "Absolute path to the script/jar/module to measure" },
          runtime: { type: "string", enum: RUNTIMES, description: "Runtime to use (auto-detected if not specified)" },
          runs: { type: "number", description: "Number of runs to measure (default: 5)", default: 5 },
        },
        required: ["scriptPath"],
      },
    },
    {
      name: "find_bottlenecks",
      description:
        "Find bottlenecks in a script: hotspots by type (CPU, memory, I/O, GC) with optimization advice.",
      inputSchema: {
        type: "object",
        properties: {
          scriptPath: { type: "string", description: "Absolute path to the script to analyze" },
          runtime: { type: "string", enum: RUNTIMES, description: "Runtime to use (auto-detected if not specified)" },
          threshold: { type: "number", description: "Minimum percentage to report as bottleneck (default: 5)", default: 5 },
        },
        required: ["scriptPath"],
      },
    },
    // ============================================
    // Live Profiling Tools
    // ============================================
    {
      name: "attach_profiler",
      description:
        "Attach the JFR profiler to a running Java process (by PID, port or name). Returns CPU hotspots.",
      inputSchema: {
        type: "object",
        properties: {
          pid: { type: "number", description: "PID of the process to profile (optional if port/name specified)" },
          port: { type: "number", description: "Port to auto-detect process (e.g., 8080 for Spring Boot)" },
          processName: { type: "string", description: "Process name pattern to search (e.g., 'spring', 'tomcat')" },
          duration: { type: "number", description: "Duration of profiling in seconds (default: 30)", default: 30 },
        },
        required: [],
      },
    },
    {
      name: "profile_endpoint",
      description:
        "Profile an HTTP endpoint over repeated requests: latency p50/p95/p99, throughput, error rate.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL of the endpoint (e.g., http://localhost:8080/api/users)" },
          method: { type: "string", enum: HTTP_METHODS, description: "HTTP method (default: GET)" },
          headers: { type: "object", description: "HTTP headers to include" },
          body: { description: "Request body for POST/PUT requests" },
          iterations: { type: "number", description: "Number of requests to make (default: 100)", default: 100 },
          concurrency: { type: "number", description: "Concurrent requests (default: 1)", default: 1 },
        },
        required: ["url"],
      },
    },
    {
      name: "list_java_processes",
      description:
        "List all running Java processes. Useful for finding the PID to attach profiler to.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    // ============================================
    // Flow Recording Tools
    // ============================================
    {
      name: "import_har",
      description:
        "Import a HAR file exported from Chrome DevTools. Creates a replayable flow from recorded HTTP requests.",
      inputSchema: {
        type: "object",
        properties: {
          harPath: { type: "string", description: "Absolute path to the .har file" },
          flowName: { type: "string", description: "Name to assign to the flow" },
          filterHost: { type: "string", description: "Only import requests to this host (e.g., localhost:8080)" },
          excludeStaticAssets: { type: "boolean", description: "Exclude .js, .css, images, etc. (default: true)", default: true },
        },
        required: ["harPath", "flowName"],
      },
    },
    {
      name: "list_flows",
      description:
        "List all saved flows. Returns flow names, descriptions, request counts, and base URLs.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "replay_flow",
      description:
        "Replay a saved flow. Optionally attach JFR profiler during replay to identify bottlenecks.",
      inputSchema: {
        type: "object",
        properties: {
          flowName: { type: "string", description: "Name of the flow to replay" },
          baseUrl: { type: "string", description: "Override the base URL (e.g., http://localhost:3000)" },
          variables: { type: "object", description: "Variables to substitute (e.g., {USER: 'admin', PASS: 'secret'})" },
          respectTiming: { type: "boolean", description: "Wait between requests based on original timing (default: false)" },
          withProfiling: { type: "boolean", description: "Attach JFR profiler during replay (default: false)" },
          profilingPort: { type: "number", description: "Port for auto-detecting process to profile" },
          stopOnError: { type: "boolean", description: "Stop replay on first error (default: false)" },
        },
        required: ["flowName"],
      },
    },
    {
      name: "stress_test_flow",
      description:
        "Run load testing on a saved flow. Simulates multiple concurrent users executing the flow repeatedly.",
      inputSchema: {
        type: "object",
        properties: {
          flowName: { type: "string", description: "Name of the flow to stress test" },
          users: { type: "number", description: "Number of concurrent virtual users" },
          duration: { type: "number", description: "Test duration in seconds" },
          rampUp: { type: "number", description: "Time to gradually add all users (default: 5s)", default: 5 },
          baseUrl: { type: "string", description: "Override the base URL" },
          variables: { type: "object", description: "Variables for all users" },
        },
        required: ["flowName", "users", "duration"],
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
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage, tool: name }),
        },
      ],
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
  console.error("Performance Profiler MCP Server v2.3.0 running on stdio");
  console.error("Supported runtimes: Node.js, Java, Python");
  console.error("Features: Script profiling, Live attach, Flow recording, Load testing");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
