// SPDX-License-Identifier: MIT
/**
 * Node.js Performance Profiler
 * Uses V8 CPU profiling, heap snapshots, and perf_hooks
 */

import { readFile, readdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import type {
  ProfileScriptResult,
  ProfileFunctionResult,
  BenchmarkResult,
  MemoryAnalysisResult,
  StartupResult,
  BottlenecksResult,
  FunctionProfile,
  Bottleneck,
  Recommendation,
  MemorySnapshot,
  StartupMeasurement,
} from '../types.js';
import {
  runCommand,
  spawnProcess,
  validateScriptPath,
  createTempDir,
  cleanupTempDir,
} from '../utils/process.js';
import { calculateStats, round, formatBytes } from '../utils/statistics.js';

/**
 * Profile a Node.js script using --cpu-prof
 */
export async function profileScript(
  scriptPath: string,
  args: string[] = [],
  duration: number = 10
): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);

  const tempDir = await createTempDir('nodejs-profile');

  try {
    // Run with CPU profiling enabled
    const cpuProfArgs = [
      '--cpu-prof',
      `--cpu-prof-dir=${tempDir}`,
      '--cpu-prof-interval=100', // 100μs sampling
      scriptPath,
      ...args,
    ];

    // Use timeout to limit profiling duration
    await spawnProcess('node', cpuProfArgs, {
      timeout: duration * 1000,
    });

    // Find the generated .cpuprofile file
    const files = await readdir(tempDir);
    const profileFile = files.find((f) => f.endsWith('.cpuprofile'));

    if (!profileFile) {
      throw new Error('CPU profile file not generated');
    }

    // Parse the profile
    const profilePath = join(tempDir, profileFile);
    const profileData = JSON.parse(await readFile(profilePath, 'utf-8'));

    // Analyze the profile
    const topFunctions = analyzeV8Profile(profileData);

    const totalTime = topFunctions.reduce((sum, f) => sum + f.selfTime, 0);

    return {
      runtime: 'nodejs',
      scriptPath,
      duration,
      topFunctions: topFunctions.slice(0, 10),
      summary: {
        totalTime: round(totalTime, 2),
        totalFunctions: topFunctions.length,
        samplesCollected: profileData.samples?.length || 0,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Analyze V8 CPU profile data
 */
function analyzeV8Profile(profileData: {
  nodes: Array<{
    id: number;
    callFrame: {
      functionName: string;
      scriptId: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    };
    hitCount: number;
    children?: number[];
  }>;
  samples?: number[];
  timeDeltas?: number[];
}): FunctionProfile[] {
  const { nodes, samples = [], timeDeltas = [] } = profileData;

  // Build node map
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Count samples per node
  const sampleCounts = new Map<number, number>();
  samples.forEach((nodeId) => {
    sampleCounts.set(nodeId, (sampleCounts.get(nodeId) || 0) + 1);
  });

  // Calculate total time
  const totalDelta = timeDeltas.reduce((sum, d) => sum + d, 0);
  const avgDelta = totalDelta / timeDeltas.length || 1;

  // Build function profiles
  const functions: FunctionProfile[] = [];

  for (const [nodeId, count] of sampleCounts) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const { callFrame } = node;

    // Skip internal functions
    if (
      callFrame.functionName === '(root)' ||
      callFrame.functionName === '(program)' ||
      callFrame.functionName === '(idle)' ||
      callFrame.functionName === '(garbage collector)'
    ) {
      continue;
    }

    const selfTime = count * avgDelta / 1000; // Convert to ms

    functions.push({
      name: callFrame.functionName || '(anonymous)',
      file: callFrame.url || '(native)',
      line: callFrame.lineNumber + 1, // 0-indexed to 1-indexed
      selfTime: round(selfTime, 2),
      totalTime: round(selfTime, 2), // Simplified - would need call tree for accurate total
      calls: count,
      percentage: 0, // Calculate after sorting
    });
  }

  // Sort by self time and calculate percentages
  functions.sort((a, b) => b.selfTime - a.selfTime);
  const totalSelfTime = functions.reduce((sum, f) => sum + f.selfTime, 0);

  for (const fn of functions) {
    fn.percentage = round((fn.selfTime / totalSelfTime) * 100, 2);
  }

  return functions;
}

/**
 * Profile a specific function by running it multiple times
 */
export async function profileFunction(
  modulePath: string,
  functionName: string,
  args: unknown[] = [],
  iterations: number = 100
): Promise<ProfileFunctionResult> {
  validateScriptPath(modulePath);

  // Validate functionName is a valid JS identifier (prevent code injection)
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName)) {
    throw new Error(`Invalid function name: ${functionName}. Must be a valid JavaScript identifier.`);
  }

  // Create a temporary script that imports and runs the function
  const tempDir = await createTempDir('nodejs-func-profile');
  const wrapperPath = join(tempDir, 'wrapper.mjs');
  const configPath = join(tempDir, 'config.json');

  // Pass configuration via a JSON file instead of string interpolation
  await writeFile(configPath, JSON.stringify({
    modulePath: modulePath.replace(/\\/g, '/'),
    functionName,
    args,
    iterations,
  }));

  const wrapperCode = `
import { performance } from 'perf_hooks';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import v8 from 'v8';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));

const require = createRequire(import.meta.url);
const targetModule = await import(config.modulePath);
const fn = targetModule[config.functionName] || targetModule.default?.[config.functionName];

if (typeof fn !== 'function') {
  console.error(JSON.stringify({ error: 'Function not found: ' + config.functionName }));
  process.exit(1);
}

const args = config.args;
const iterations = config.iterations;
const timings = [];

// Warmup
for (let i = 0; i < Math.min(10, iterations); i++) {
  await fn(...args);
}

// Force GC before measurement if available
if (global.gc) global.gc();

const heapBefore = v8.getHeapStatistics().used_heap_size;

// Measure
for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  await fn(...args);
  timings.push(performance.now() - start);
}

const heapAfter = v8.getHeapStatistics().used_heap_size;

console.log(JSON.stringify({
  timings,
  heapBefore,
  heapAfter
}));
`;

  try {
    await writeFile(wrapperPath, wrapperCode);

    const result = await runCommand(`node --expose-gc ${wrapperPath}`, {
      timeout: 120000, // 2 minutes max
    });

    if (result.exitCode !== 0) {
      throw new Error(`Function profiling failed: ${result.stderr}`);
    }

    const data = JSON.parse(result.stdout);

    if (data.error) {
      throw new Error(data.error);
    }

    const stats = calculateStats(data.timings);

    return {
      functionName,
      iterations,
      timing: {
        mean: stats.mean,
        median: stats.median,
        min: stats.min,
        max: stats.max,
        stdDev: stats.stdDev,
      },
      memory: {
        heapUsedBefore: data.heapBefore,
        heapUsedAfter: data.heapAfter,
        delta: data.heapAfter - data.heapBefore,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/** Dangerous patterns that should not appear in benchmark code */
const DANGEROUS_CODE_PATTERNS = [
  /\brequire\s*\(/i,
  /\bimport\s*\(/i,
  /\bchild_process\b/i,
  /\bexec\s*\(/i,
  /\bexecSync\s*\(/i,
  /\bspawn\s*\(/i,
  /\bprocess\.exit/i,
  /\bprocess\.env/i,
  /\bprocess\.kill/i,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bglobalThis\s*\.\s*process/i,
  /\bfs\s*\.\s*(write|unlink|rm|mkdir|rename|chmod|chown)/i,
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bnew\s+Function/i,
];

/** Validate benchmark code doesn't contain dangerous patterns */
function validateBenchmarkCode(code: string): void {
  for (const pattern of DANGEROUS_CODE_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(
        `Benchmark code contains forbidden pattern: ${pattern.source}. ` +
        `Only pure computation code is allowed for benchmarking.`
      );
    }
  }
}

/**
 * Benchmark inline JavaScript code
 */
export async function benchmarkCode(
  code: string,
  iterations: number = 1000,
  warmup: number = 100
): Promise<BenchmarkResult> {
  validateBenchmarkCode(code);

  const tempDir = await createTempDir('nodejs-benchmark');
  const benchmarkPath = join(tempDir, 'benchmark.mjs');

  const benchmarkScript = `
import { performance } from 'perf_hooks';

const iterations = ${iterations};
const warmupIterations = ${warmup};
const timings = [];

// The code to benchmark
const benchmarkFn = async () => {
  ${code}
};

// Warmup phase
for (let i = 0; i < warmupIterations; i++) {
  await benchmarkFn();
}

// Measurement phase
for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  await benchmarkFn();
  timings.push(performance.now() - start);
}

console.log(JSON.stringify({ timings }));
`;

  try {
    await writeFile(benchmarkPath, benchmarkScript);

    const result = await runCommand(`node ${benchmarkPath}`, {
      timeout: 300000, // 5 minutes max for large iteration counts
    });

    if (result.exitCode !== 0) {
      throw new Error(`Benchmark failed: ${result.stderr}`);
    }

    const data = JSON.parse(result.stdout);
    const stats = calculateStats(data.timings);

    return {
      iterations,
      warmupIterations: warmup,
      timing: stats,
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Analyze memory usage of a Node.js script
 */
export async function analyzeMemory(
  scriptPath: string,
  snapshotInterval: number = 1000,
  duration: number = 10
): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);

  const tempDir = await createTempDir('nodejs-memory');
  const wrapperPath = join(tempDir, 'memory-wrapper.mjs');
  const memConfigPath = join(tempDir, 'config.json');

  // Pass configuration via JSON file instead of string interpolation
  await writeFile(memConfigPath, JSON.stringify({
    scriptPath: scriptPath.replace(/\\/g, '/'),
    snapshotInterval,
    durationMs: duration * 1000,
  }));

  const wrapperCode = `
import v8 from 'v8';
import { fork } from 'child_process';
import { performance } from 'perf_hooks';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));

const snapshots = [];
const startTime = performance.now();

// Start the target script
const child = fork(config.scriptPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  execArgv: ['--expose-gc']
});

// Collect memory snapshots
const intervalId = setInterval(() => {
  const heapStats = v8.getHeapStatistics();
  snapshots.push({
    timestamp: performance.now() - startTime,
    heapUsed: heapStats.used_heap_size,
    heapTotal: heapStats.total_heap_size,
    external: heapStats.external_memory,
  });
}, config.snapshotInterval);

// Stop after duration
setTimeout(() => {
  clearInterval(intervalId);
  child.kill();
  console.log(JSON.stringify({ snapshots }));
  process.exit(0);
}, config.durationMs);

child.on('exit', () => {
  clearInterval(intervalId);
  console.log(JSON.stringify({ snapshots }));
  process.exit(0);
});
`;

  try {
    await writeFile(wrapperPath, wrapperCode);

    const result = await runCommand(`node ${wrapperPath}`, {
      timeout: (duration + 5) * 1000,
    });

    const data = JSON.parse(result.stdout || '{"snapshots":[]}');
    const snapshots: MemorySnapshot[] = data.snapshots;

    if (snapshots.length === 0) {
      throw new Error('No memory snapshots collected');
    }

    // Analyze snapshots
    const heapValues = snapshots.map((s) => s.heapUsed);
    const initialHeap = heapValues[0];
    const finalHeap = heapValues[heapValues.length - 1];
    const peakHeap = Math.max(...heapValues);
    const avgHeap = heapValues.reduce((sum, v) => sum + v, 0) / heapValues.length;
    const heapGrowth = finalHeap - initialHeap;

    // Detect potential memory leaks
    const growthRate = heapGrowth / (duration * 1000); // bytes per ms
    const detected = growthRate > 1000; // More than 1KB/ms growth is suspicious

    return {
      runtime: 'nodejs',
      snapshots,
      summary: {
        initialHeap,
        finalHeap,
        peakHeap,
        avgHeap: round(avgHeap, 0),
        heapGrowth,
      },
      potentialLeaks: {
        detected,
        reason: detected
          ? `Heap grew by ${formatBytes(heapGrowth)} over ${duration}s (${formatBytes(growthRate * 1000)}/s)`
          : undefined,
        growthRate: detected ? round(growthRate * 1000, 2) : undefined,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Measure startup time of a Node.js script
 */
export async function measureStartup(
  scriptPath: string,
  runs: number = 5
): Promise<StartupResult> {
  validateScriptPath(scriptPath);

  const measurements: StartupMeasurement[] = [];

  for (let i = 0; i < runs; i++) {
    const start = Date.now();

    // Run script and measure until it exits or times out
    const result = await spawnProcess('node', [scriptPath], {
      timeout: 30000, // 30s max for startup
    });

    const totalTime = result.duration;

    measurements.push({
      run: i + 1,
      totalTime,
    });
  }

  const times = measurements.map((m) => m.totalTime);
  const stats = calculateStats(times);

  return {
    runtime: 'nodejs',
    runs: measurements,
    summary: {
      avgStartup: stats.mean,
      minStartup: stats.min,
      maxStartup: stats.max,
      stdDev: stats.stdDev,
      coldStart: measurements[0]?.totalTime || 0,
      warmStart:
        measurements.length > 1
          ? round(
              measurements.slice(1).reduce((sum, m) => sum + m.totalTime, 0) /
                (measurements.length - 1),
              2
            )
          : measurements[0]?.totalTime || 0,
    },
  };
}

/**
 * Find performance bottlenecks in a Node.js script
 */
export async function findBottlenecks(
  scriptPath: string,
  threshold: number = 5
): Promise<BottlenecksResult> {
  // Profile the script first
  const profileResult = await profileScript(scriptPath, [], 10);

  // Filter functions above threshold
  const hotspots: Bottleneck[] = profileResult.topFunctions
    .filter((f) => f.percentage >= threshold)
    .map((f) => ({
      function: f.name,
      file: f.file,
      line: f.line,
      selfTime: f.selfTime,
      percentage: f.percentage,
      category: categorizeBottleneck(f.name, f.file),
    }));

  // Generate recommendations
  const recommendations = generateRecommendations(hotspots);

  return {
    runtime: 'nodejs',
    hotspots,
    recommendations,
    summary: {
      totalBottlenecks: hotspots.length,
      topCategory: hotspots[0]?.category || 'none',
      estimatedImpact:
        hotspots.length > 0
          ? `${round(hotspots.reduce((sum, h) => sum + h.percentage, 0), 1)}% of execution time`
          : 'No significant bottlenecks found',
    },
  };
}

/**
 * Categorize a bottleneck based on function name and file
 */
function categorizeBottleneck(
  functionName: string,
  file: string
): 'cpu' | 'memory' | 'io' | 'gc' {
  const lowerName = functionName.toLowerCase();
  const lowerFile = file.toLowerCase();

  if (
    lowerName.includes('gc') ||
    lowerName.includes('garbage') ||
    lowerName.includes('scavenge')
  ) {
    return 'gc';
  }

  if (
    lowerName.includes('read') ||
    lowerName.includes('write') ||
    lowerName.includes('fetch') ||
    lowerName.includes('request') ||
    lowerFile.includes('fs') ||
    lowerFile.includes('net') ||
    lowerFile.includes('http')
  ) {
    return 'io';
  }

  if (
    lowerName.includes('alloc') ||
    lowerName.includes('buffer') ||
    lowerName.includes('array')
  ) {
    return 'memory';
  }

  return 'cpu';
}

/**
 * Generate optimization recommendations based on bottlenecks
 */
function generateRecommendations(hotspots: Bottleneck[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const hotspot of hotspots) {
    switch (hotspot.category) {
      case 'gc':
        recommendations.push({
          issue: `High GC time in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider reducing object allocations, using object pools, or increasing heap size with --max-old-space-size',
          priority: hotspot.percentage > 20 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'io':
        recommendations.push({
          issue: `I/O bottleneck in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using streaming, caching, connection pooling, or batching I/O operations',
          priority: hotspot.percentage > 30 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'memory':
        recommendations.push({
          issue: `Memory-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using typed arrays, reducing allocations, or processing data in chunks',
          priority: hotspot.percentage > 25 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'cpu':
        if (hotspot.percentage > 10) {
          recommendations.push({
            issue: `CPU-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
            suggestion:
              'Consider algorithm optimization, caching results, or offloading to worker threads',
            priority: hotspot.percentage > 30 ? 'high' : 'medium',
            relatedFunction: hotspot.function,
          });
        }
        break;
    }
  }

  return recommendations;
}
