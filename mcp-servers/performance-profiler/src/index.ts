// SPDX-License-Identifier: MIT
/**
 * Performance Profiler MCP Server
 *
 * CPU profiling (Node, Python, Java, Go, .NET) with flame graphs and kept
 * artifacts, memory/leak analysis on the target process, statistically sound
 * microbenchmarks with A/B comparison, HTTP load testing (open/closed model,
 * thresholds, background jobs), baselines/regression checks and Web Vitals.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { handlers, errorResponse } from './handlers/index.js';

const VERSION = '2.4.0';

const server = new Server(
  {
    name: 'performance-profiler-server',
    version: '2.4.0',
  },
  { capabilities: { tools: {} } }
);

const RUNTIMES = ['nodejs', 'java', 'python', 'go', 'dotnet'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const background = {
  type: 'boolean',
  description: 'Run as a background job (poll get_job). Default: automatic when the run is expected to exceed 30s',
};
const limit = { type: 'number', description: 'Max functions/rows returned (default 20, max 500); result says truncated' };
const scriptArgs = { type: 'array', items: { type: 'string' }, description: 'Arguments passed to the script' };
const thresholds = {
  type: 'array',
  items: { type: 'string' },
  description: 'Pass/fail checks, e.g. ["p95<300", "p(99)<=800", "error_rate<1%", "rps>=50"] (latency in ms)',
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ----- Script profiling -----
    {
      name: 'profile_script',
      description: 'CPU-profile a script (Node, Python, Java, Go, .NET): self/total time, hot paths, flame graph + speedscope files.',
      inputSchema: {
        type: 'object',
        properties: {
          scriptPath: { type: 'string', description: 'Absolute path to the script/jar/.dll (Go: package directory)' },
          runtime: { type: 'string', enum: RUNTIMES, description: 'Runtime (auto-detected from the extension if omitted)' },
          args: scriptArgs,
          duration: { type: 'number', description: 'Max seconds to profile; a still-running target is stopped (default 10)' },
          limit,
          samplingIntervalUs: { type: 'number', description: 'Node: V8 sampling interval in microseconds (default 500)' },
          profiler: { type: 'string', enum: ['cprofile', 'py-spy'], description: 'Python: cprofile (exact calls, default) or py-spy (sampling)' },
          goBench: { type: 'string', description: 'Go: benchmark regex to profile (otherwise tests are run)' },
          goTest: { type: 'string', description: 'Go: test regex (default ".")' },
          background,
        },
        required: ['scriptPath'],
      },
    },
    {
      name: 'profile_function',
      description: 'Time one exported function over many calls: mean/median/p95/p99, 95% CI, memory delta (Node, Python, Java).',
      inputSchema: {
        type: 'object',
        properties: {
          modulePath: { type: 'string', description: 'Absolute path to the module (Java: .jar or classes dir)' },
          functionName: { type: 'string', description: 'Exported function name (Java: fully.qualified.Class.method, no-arg)' },
          args: { type: 'array', description: 'JSON arguments passed to the function (max 100 / 64 KB)' },
          iterations: { type: 'number', description: 'Measured calls (default 100)' },
          warmup: { type: 'number', description: 'Unmeasured warm-up calls (default 10)' },
          runtime: { type: 'string', enum: ['nodejs', 'python', 'java'], description: 'Runtime' },
        },
        required: ['modulePath', 'functionName', 'runtime'],
      },
    },
    {
      name: 'benchmark_code',
      description: 'Microbenchmark a script (or A/B two variants): warmup, outlier removal, CI, Welch t-test significance.',
      inputSchema: {
        type: 'object',
        properties: {
          scriptPath: { type: 'string', description: 'Script exporting a default/bench function (else run as a whole process)' },
          code: { type: 'string', description: 'Inline snippet; needs PERF_PROFILER_ALLOW_RAW_CODE=true (unsafe)' },
          runtime: { type: 'string', enum: RUNTIMES, description: 'Runtime' },
          iterations: { type: 'number', description: 'Samples (default 1000 in-process, 20 in process mode)' },
          warmup: { type: 'number', description: 'Warm-up iterations (default 100 in-process, 2 in process mode)' },
          compareScriptPath: { type: 'string', description: 'Variant B script for an A/B comparison' },
          compareCode: { type: 'string', description: 'Variant B inline snippet (same opt-in as code)' },
          removeOutliers: { type: 'boolean', description: 'Drop Tukey outliers before statistics (default true)' },
          background,
        },
        required: ['runtime'],
      },
    },
    {
      name: 'analyze_memory',
      description: "Track the target's heap over time, diff snapshots/histograms and give a leak verdict (Node, Python, Java, .NET).",
      inputSchema: {
        type: 'object',
        properties: {
          scriptPath: { type: 'string', description: 'Absolute path to the script to run (or use pid / inspectPort)' },
          runtime: { type: 'string', enum: RUNTIMES, description: 'Runtime (auto-detected from scriptPath if omitted)' },
          pid: { type: 'number', description: 'Observe a running process instead (java, dotnet; nodejs enables its inspector)' },
          inspectPort: { type: 'number', description: 'Node: inspector port of a process started with --inspect' },
          args: scriptArgs,
          snapshotInterval: { type: 'number', description: 'Sampling interval in ms (default 1000)' },
          duration: { type: 'number', description: 'Seconds to observe; the launched target is stopped after (default 10)' },
          forceGc: { type: 'boolean', description: 'Force a GC before each sample for a cleaner trend (default true)' },
          heapSnapshots: { type: 'boolean', description: 'Node: take and diff two heap snapshots (default true)' },
          limit,
          background,
        },
        required: [],
      },
    },
    {
      name: 'measure_startup',
      description: 'Measure time-to-ready over several runs (port open, log line or HTTP 200), or time to exit if none given.',
      inputSchema: {
        type: 'object',
        properties: {
          scriptPath: { type: 'string', description: 'Absolute path to the script/jar/.dll to start' },
          runtime: { type: 'string', enum: RUNTIMES, description: 'Runtime (auto-detected if omitted)' },
          runs: { type: 'number', description: 'Number of runs (default 5, max 50)' },
          args: scriptArgs,
          readyPort: { type: 'number', description: 'Ready when localhost:<port> accepts TCP connections' },
          readyLogPattern: { type: 'string', description: 'Ready when a stdout/stderr line matches this regex' },
          readyUrl: { type: 'string', description: 'Ready when GET <url> returns 2xx' },
          timeout: { type: 'number', description: 'Per-run timeout in seconds (default 60)' },
        },
        required: ['scriptPath'],
      },
    },
    {
      name: 'find_bottlenecks',
      description: 'Profile a script and classify hotspots from profile evidence (GC, idle, I/O, locks, CPU) with advice.',
      inputSchema: {
        type: 'object',
        properties: {
          scriptPath: { type: 'string', description: 'Absolute path to the script (Go: package directory)' },
          runtime: { type: 'string', enum: RUNTIMES, description: 'Runtime (auto-detected if omitted)' },
          threshold: { type: 'number', description: 'Minimum self-time percent to report (default 5)' },
          duration: { type: 'number', description: 'Max seconds to profile (default 10)' },
          args: scriptArgs,
          profiler: { type: 'string', enum: ['cprofile', 'py-spy'], description: 'Python profiler (default cprofile)' },
          goBench: { type: 'string', description: 'Go: benchmark regex to profile' },
          background,
        },
        required: ['scriptPath'],
      },
    },
    // ----- Live profiling -----
    {
      name: 'attach_profiler',
      description: 'CPU-profile a running process: Java (JFR), Node (--inspect), Python (py-spy), .NET (dotnet-trace).',
      inputSchema: {
        type: 'object',
        properties: {
          runtime: { type: 'string', enum: ['java', 'nodejs', 'python', 'dotnet'], description: 'Runtime of the target (default java)' },
          pid: { type: 'number', description: 'Target PID (Node: enables the inspector on it)' },
          port: { type: 'number', description: 'Find the target by the TCP port it listens on (e.g. 8080)' },
          processName: { type: 'string', description: 'Java: JVM main class / jar name pattern' },
          inspectPort: { type: 'number', description: 'Node: inspector port (default 9229)' },
          duration: { type: 'number', description: 'Seconds to record (default 30)' },
          mode: { type: 'string', enum: ['record', 'dump'], description: 'Python: record a profile or dump current stacks' },
          threshold: { type: 'number', description: 'Hotspot threshold percent (default 5)' },
          limit,
          background,
        },
        required: [],
      },
    },
    {
      name: 'profile_endpoint',
      description: 'Load-test one HTTP endpoint: closed or open (rate) model, latency percentiles, histogram, thresholds.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL (private addresses need PERF_PROFILER_ALLOW_PRIVATE_URLS=true)' },
          method: { type: 'string', enum: HTTP_METHODS, description: 'HTTP method (default GET)' },
          headers: { type: 'object', description: 'HTTP headers' },
          body: { description: 'Request body (JSON-encoded unless a string)' },
          iterations: { type: 'number', description: 'Total requests for a count-bounded run (default 100)' },
          duration: { type: 'number', description: 'Seconds for a time-bounded run (instead of iterations)' },
          concurrency: { type: 'number', description: 'Closed model: virtual users; open model: max in flight' },
          rate: { type: 'number', description: 'Open model: requests started per second (constant arrival rate)' },
          rampUp: { type: 'number', description: 'Closed model: seconds to ramp up to full concurrency' },
          warmupIterations: { type: 'number', description: 'Unmeasured warm-up requests (default 5)' },
          timeoutMs: { type: 'number', description: 'Per-request timeout (default 30000)' },
          thresholds,
          background,
        },
        required: ['url'],
      },
    },
    {
      name: 'list_java_processes',
      description: 'List running Java processes (jps) to find the PID to attach the profiler to.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    // ----- Flows -----
    {
      name: 'import_har',
      description: 'Import a HAR file exported from Chrome DevTools. Creates a replayable flow from recorded HTTP requests.',
      inputSchema: {
        type: 'object',
        properties: {
          harPath: { type: 'string', description: 'Absolute path to the .har file' },
          flowName: { type: 'string', description: 'Name to assign to the flow' },
          filterHost: { type: 'string', description: 'Only import requests to this host (e.g., localhost:8080)' },
          excludeStaticAssets: { type: 'boolean', description: 'Exclude .js, .css, images, etc. (default: true)' },
        },
        required: ['harPath', 'flowName'],
      },
    },
    {
      name: 'list_flows',
      description: 'List all saved flows. Returns flow names, descriptions, request counts, and base URLs.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'replay_flow',
      description: 'Replay a saved flow. Optionally attach JFR profiler during replay to identify bottlenecks.',
      inputSchema: {
        type: 'object',
        properties: {
          flowName: { type: 'string', description: 'Name of the flow to replay' },
          baseUrl: { type: 'string', description: 'Override the base URL (e.g., http://localhost:3000)' },
          variables: { type: 'object', description: 'Variables to substitute (e.g., {USER: "admin"})' },
          respectTiming: { type: 'boolean', description: 'Wait between requests based on original timing (default: false)' },
          withProfiling: { type: 'boolean', description: 'Attach JFR during replay (needs profilingPort or profilingPid)' },
          profilingPort: { type: 'number', description: 'Port for auto-detecting the JVM to profile' },
          profilingPid: { type: 'number', description: 'PID of the JVM to profile' },
          stopOnError: { type: 'boolean', description: 'Stop replay on first error (default: false)' },
        },
        required: ['flowName'],
      },
    },
    {
      name: 'stress_test_flow',
      description: 'Load-test a saved flow with virtual users or a constant arrival rate; caps, thresholds, background jobs.',
      inputSchema: {
        type: 'object',
        properties: {
          flowName: { type: 'string', description: 'Name of the flow to stress test' },
          users: { type: 'number', description: 'Closed model: concurrent virtual users; open model: max in flight' },
          duration: { type: 'number', description: 'Test duration in seconds' },
          rampUp: { type: 'number', description: 'Seconds to ramp up all users (default 5)' },
          arrivalRate: { type: 'number', description: 'Open model: flow iterations started per second' },
          maxRate: { type: 'number', description: 'Closed model: ceiling on flow iterations per second' },
          thinkTime: { type: 'number', description: 'Delay between requests in ms (default 0)' },
          baseUrl: { type: 'string', description: 'Override the base URL' },
          variables: { type: 'object', description: 'Variables for all users' },
          thresholds,
          background,
        },
        required: ['flowName', 'users', 'duration'],
      },
    },
    // ----- Jobs -----
    {
      name: 'get_job',
      description: 'Status, live progress and (when finished) the result of a background job.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job id returned by a tool started in the background' },
          wait: { type: 'number', description: 'Seconds to wait for completion before answering (0-25, default 0)' },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'stop_job',
      description: 'Stop a running background job; partial results are returned when the tool supports them.',
      inputSchema: {
        type: 'object',
        properties: { jobId: { type: 'string', description: 'Job id to stop' } },
        required: ['jobId'],
      },
    },
    {
      name: 'list_jobs',
      description: 'List background jobs of this server session with their status.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    // ----- Baselines -----
    {
      name: 'save_baseline',
      description: 'Save a recorded run (runId from any measuring tool) as a named baseline for later regression checks.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Baseline name (letters, digits, . _ -)' },
          runId: { type: 'string', description: 'runId returned by a profiling/benchmark/load tool' },
          overwrite: { type: 'boolean', description: 'Replace an existing baseline of that name (default false: preview only)' },
        },
        required: ['name', 'runId'],
      },
    },
    {
      name: 'list_baselines',
      description: 'List saved baselines with their kind, subject and headline metrics.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'compare_results',
      description: 'Compare a run against a baseline or another run: per-metric change, significance, regression verdict.',
      inputSchema: {
        type: 'object',
        properties: {
          baseline: { type: 'string', description: 'Baseline name or runId' },
          current: { type: 'string', description: 'runId of the new run' },
          tolerancePct: { type: 'number', description: 'Change below this percent is "unchanged" (default 5)' },
        },
        required: ['baseline', 'current'],
      },
    },
    // ----- Frontend -----
    {
      name: 'audit_web_vitals',
      description: 'Measure a page with Lighthouse (or headless Chrome): LCP, CLS, TBT, FCP, TTI, score, top opportunities.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Page URL (private addresses need PERF_PROFILER_ALLOW_PRIVATE_URLS=true)' },
          formFactor: { type: 'string', enum: ['mobile', 'desktop'], description: 'Emulation profile (default mobile)' },
          runs: { type: 'number', description: 'Runs to take the median of (1-5, default 1)' },
          engine: { type: 'string', enum: ['auto', 'lighthouse', 'chrome'], description: 'auto: Lighthouse if installed, else Chrome' },
          background,
        },
        required: ['url'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const handler = handlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return await handler(args ?? {});
  } catch (error) {
    return errorResponse(error, name);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Performance Profiler MCP Server v${VERSION} running on stdio`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
