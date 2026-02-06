// SPDX-License-Identifier: MIT
/**
 * Python Performance Profiler
 * Uses cProfile, pstats, tracemalloc, and memory_profiler
 */

import { writeFile } from 'fs/promises';
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
 * Profile a Python script using cProfile
 */
export async function profileScript(
  scriptPath: string,
  args: string[] = [],
  duration: number = 10
): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);

  const tempDir = await createTempDir('python-profile');
  const profilePath = join(tempDir, 'profile.prof');
  const outputPath = join(tempDir, 'profile.json');

  // Python script to run profiling and output JSON
  const analyzerScript = `
import cProfile
import pstats
import json
import sys

# Run profiler
profiler = cProfile.Profile()
profiler.enable()

# Import and run target script
import runpy
runpy.run_path('${scriptPath.replace(/\\/g, '/')}', run_name='__main__')

profiler.disable()

# Analyze results
stats = pstats.Stats(profiler)
stats.sort_stats('cumulative')

# Extract top functions
functions = []
for func, (cc, nc, tt, ct, callers) in stats.stats.items():
    filename, line, name = func
    functions.append({
        'name': name,
        'file': filename,
        'line': line,
        'selfTime': tt * 1000,  # Convert to ms
        'totalTime': ct * 1000,
        'calls': nc
    })

# Sort by self time
functions.sort(key=lambda x: x['selfTime'], reverse=True)

# Calculate percentages
total_time = sum(f['selfTime'] for f in functions)
for f in functions:
    f['percentage'] = (f['selfTime'] / total_time * 100) if total_time > 0 else 0

print(json.dumps({
    'functions': functions[:50],
    'totalFunctions': len(functions),
    'totalTime': total_time
}))
`;

  const analyzerPath = join(tempDir, 'analyzer.py');

  try {
    await writeFile(analyzerPath, analyzerScript);

    const result = await runCommand(`python3 ${analyzerPath}`, {
      timeout: duration * 1000 + 10000,
      cwd: tempDir,
    });

    if (result.exitCode !== 0 && !result.stdout) {
      throw new Error(`Python profiling failed: ${result.stderr}`);
    }

    // Parse JSON output (may be mixed with script output)
    const lines = result.stdout.split('\n');
    const jsonLine = lines.find((l) => l.startsWith('{'));

    if (!jsonLine) {
      throw new Error('Could not parse profiler output');
    }

    const data = JSON.parse(jsonLine);

    const topFunctions: FunctionProfile[] = data.functions.map(
      (f: {
        name: string;
        file: string;
        line: number;
        selfTime: number;
        totalTime: number;
        calls: number;
        percentage: number;
      }) => ({
        name: f.name,
        file: f.file,
        line: f.line,
        selfTime: round(f.selfTime, 2),
        totalTime: round(f.totalTime, 2),
        calls: f.calls,
        percentage: round(f.percentage, 2),
      })
    );

    return {
      runtime: 'python',
      scriptPath,
      duration,
      topFunctions: topFunctions.slice(0, 10),
      summary: {
        totalTime: round(data.totalTime, 2),
        totalFunctions: data.totalFunctions,
        samplesCollected: data.totalFunctions,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Profile a specific Python function
 */
export async function profileFunction(
  modulePath: string,
  functionName: string,
  args: unknown[] = [],
  iterations: number = 100
): Promise<ProfileFunctionResult> {
  validateScriptPath(modulePath);

  const tempDir = await createTempDir('python-func-profile');
  const wrapperPath = join(tempDir, 'wrapper.py');

  const wrapperCode = `
import sys
import time
import json
import tracemalloc
import importlib.util

# Load module
spec = importlib.util.spec_from_file_location("target", "${modulePath.replace(/\\/g, '/')}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

# Get function
fn = getattr(module, "${functionName}", None)
if fn is None:
    print(json.dumps({"error": "Function not found: ${functionName}"}))
    sys.exit(1)

args = ${JSON.stringify(args)}
iterations = ${iterations}
timings = []

# Warmup
for _ in range(min(10, iterations)):
    fn(*args)

# Start memory tracking
tracemalloc.start()
snapshot_before = tracemalloc.take_snapshot()

# Measure
for _ in range(iterations):
    start = time.perf_counter()
    fn(*args)
    timings.append((time.perf_counter() - start) * 1000)  # ms

snapshot_after = tracemalloc.take_snapshot()
tracemalloc.stop()

# Calculate memory diff
stats = snapshot_after.compare_to(snapshot_before, 'lineno')
memory_delta = sum(stat.size_diff for stat in stats)

print(json.dumps({
    "timings": timings,
    "memoryBefore": sum(stat.size for stat in snapshot_before.statistics('lineno')),
    "memoryAfter": sum(stat.size for stat in snapshot_after.statistics('lineno')),
    "memoryDelta": memory_delta
}))
`;

  try {
    await writeFile(wrapperPath, wrapperCode);

    const result = await runCommand(`python3 ${wrapperPath}`, {
      timeout: 120000,
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
        heapUsedBefore: data.memoryBefore,
        heapUsedAfter: data.memoryAfter,
        delta: data.memoryDelta,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Benchmark inline Python code
 */
export async function benchmarkCode(
  code: string,
  iterations: number = 1000,
  warmup: number = 100
): Promise<BenchmarkResult> {
  const tempDir = await createTempDir('python-benchmark');
  const benchmarkPath = join(tempDir, 'benchmark.py');

  // Escape the code for embedding
  const escapedCode = code.replace(/'/g, "\\'").replace(/"/g, '\\"');

  const benchmarkScript = `
import time
import json

iterations = ${iterations}
warmup_iterations = ${warmup}
timings = []

# The code to benchmark
def benchmark_fn():
    ${code.split('\n').join('\n    ')}

# Warmup phase
for _ in range(warmup_iterations):
    benchmark_fn()

# Measurement phase
for _ in range(iterations):
    start = time.perf_counter()
    benchmark_fn()
    timings.append((time.perf_counter() - start) * 1000)  # ms

print(json.dumps({"timings": timings}))
`;

  try {
    await writeFile(benchmarkPath, benchmarkScript);

    const result = await runCommand(`python3 ${benchmarkPath}`, {
      timeout: 300000,
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
 * Analyze memory usage of a Python script
 */
export async function analyzeMemory(
  scriptPath: string,
  snapshotInterval: number = 1000,
  duration: number = 10
): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);

  const tempDir = await createTempDir('python-memory');
  const wrapperPath = join(tempDir, 'memory_wrapper.py');

  const wrapperCode = `
import sys
import time
import json
import tracemalloc
import subprocess
import threading

script_path = "${scriptPath.replace(/\\/g, '/')}"
snapshot_interval = ${snapshotInterval / 1000}  # Convert to seconds
duration = ${duration}

snapshots = []
start_time = time.time()

tracemalloc.start()

def collect_snapshots():
    while time.time() - start_time < duration:
        current, peak = tracemalloc.get_traced_memory()
        snapshots.append({
            "timestamp": (time.time() - start_time) * 1000,
            "heapUsed": current,
            "heapTotal": peak
        })
        time.sleep(snapshot_interval)

# Start collection thread
collector = threading.Thread(target=collect_snapshots)
collector.start()

# Run target script
try:
    exec(open(script_path).read())
except Exception as e:
    pass

collector.join(timeout=duration + 1)
tracemalloc.stop()

print(json.dumps({"snapshots": snapshots}))
`;

  try {
    await writeFile(wrapperPath, wrapperCode);

    const result = await runCommand(`python3 ${wrapperPath}`, {
      timeout: (duration + 10) * 1000,
    });

    const data = JSON.parse(result.stdout || '{"snapshots":[]}');
    const snapshots: MemorySnapshot[] = data.snapshots;

    if (snapshots.length === 0) {
      throw new Error('No memory snapshots collected');
    }

    const heapValues = snapshots.map((s) => s.heapUsed);
    const initialHeap = heapValues[0];
    const finalHeap = heapValues[heapValues.length - 1];
    const peakHeap = Math.max(...heapValues);
    const avgHeap = heapValues.reduce((sum, v) => sum + v, 0) / heapValues.length;
    const heapGrowth = finalHeap - initialHeap;

    const growthRate = heapGrowth / (duration * 1000);
    const detected = growthRate > 1000;

    return {
      runtime: 'python',
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
          ? `Memory grew by ${formatBytes(heapGrowth)} over ${duration}s`
          : undefined,
        growthRate: detected ? round(growthRate * 1000, 2) : undefined,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Measure startup time of a Python script
 */
export async function measureStartup(
  scriptPath: string,
  runs: number = 5
): Promise<StartupResult> {
  validateScriptPath(scriptPath);

  const measurements: StartupMeasurement[] = [];

  for (let i = 0; i < runs; i++) {
    const result = await spawnProcess('python3', [scriptPath], {
      timeout: 30000,
    });

    measurements.push({
      run: i + 1,
      totalTime: result.duration,
    });
  }

  const times = measurements.map((m) => m.totalTime);
  const stats = calculateStats(times);

  return {
    runtime: 'python',
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
 * Find performance bottlenecks in a Python script
 */
export async function findBottlenecks(
  scriptPath: string,
  threshold: number = 5
): Promise<BottlenecksResult> {
  const profileResult = await profileScript(scriptPath, [], 10);

  const hotspots: Bottleneck[] = profileResult.topFunctions
    .filter((f) => f.percentage >= threshold)
    .map((f) => ({
      function: f.name,
      file: f.file,
      line: f.line,
      selfTime: f.selfTime,
      percentage: f.percentage,
      category: categorizePythonBottleneck(f.name, f.file),
    }));

  const recommendations = generatePythonRecommendations(hotspots);

  return {
    runtime: 'python',
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

function categorizePythonBottleneck(
  functionName: string,
  file: string
): 'cpu' | 'memory' | 'io' | 'gc' {
  const lowerName = functionName.toLowerCase();
  const lowerFile = file.toLowerCase();

  if (lowerName.includes('gc') || lowerName.includes('collect')) {
    return 'gc';
  }

  if (
    lowerName.includes('read') ||
    lowerName.includes('write') ||
    lowerName.includes('open') ||
    lowerName.includes('request') ||
    lowerFile.includes('io') ||
    lowerFile.includes('socket') ||
    lowerFile.includes('http')
  ) {
    return 'io';
  }

  if (
    lowerName.includes('alloc') ||
    lowerName.includes('list') ||
    lowerName.includes('dict') ||
    lowerName.includes('copy')
  ) {
    return 'memory';
  }

  return 'cpu';
}

function generatePythonRecommendations(hotspots: Bottleneck[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const hotspot of hotspots) {
    switch (hotspot.category) {
      case 'gc':
        recommendations.push({
          issue: `High GC time in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using __slots__ in classes, reducing object creation, or using generators',
          priority: hotspot.percentage > 20 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'io':
        recommendations.push({
          issue: `I/O bottleneck in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using async I/O (asyncio), connection pooling, or buffered I/O',
          priority: hotspot.percentage > 30 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'memory':
        recommendations.push({
          issue: `Memory-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using generators, numpy arrays, or processing data in chunks',
          priority: hotspot.percentage > 25 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'cpu':
        if (hotspot.percentage > 10) {
          recommendations.push({
            issue: `CPU-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
            suggestion:
              'Consider using NumPy/Cython for numerical code, multiprocessing, or algorithm optimization',
            priority: hotspot.percentage > 30 ? 'high' : 'medium',
            relatedFunction: hotspot.function,
          });
        }
        break;
    }
  }

  return recommendations;
}
