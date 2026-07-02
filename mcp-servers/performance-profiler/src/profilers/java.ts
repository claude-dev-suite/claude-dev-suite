// SPDX-License-Identifier: MIT
/**
 * Java/JVM Performance Profiler
 * Uses JFR (Java Flight Recorder), jcmd, and JVM diagnostic tools
 */

import { writeFile, readFile } from 'fs/promises';
import { join, basename } from 'path';
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
 * NOTE: The regex-blocklist approach for validating raw Java code has been
 * intentionally removed.  A pattern-based blocklist cannot reliably prevent
 * arbitrary code execution in Java (Unicode escapes, string concatenation,
 * reflection, etc. all provide bypass paths).
 *
 * benchmarkCode() now defaults to scriptPath mode (safe).  Raw-code execution
 * is available only when PERF_PROFILER_ALLOW_RAW_CODE=1 is explicitly set by
 * the server operator — the same gating used by nodejs.ts and python.ts.
 * This opt-in must never be enabled in production or multi-tenant deployments.
 */

/** Validate a Java identifier (class or method name) */
function validateJavaIdentifier(name: string): void {
  // Allow qualified names like com.example.MyClass
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(name)) {
    throw new Error(`Invalid Java identifier: ${name}`);
  }
}

/**
 * Profile a Java application using JFR (Java Flight Recorder)
 */
export async function profileScript(
  scriptPath: string,
  args: string[] = [],
  duration: number = 10
): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);

  const tempDir = await createTempDir('java-profile');
  const jfrPath = join(tempDir, 'recording.jfr');

  try {
    // Determine how to run the Java application
    const isJar = scriptPath.endsWith('.jar');
    const isJava = scriptPath.endsWith('.java');

    let javaArgs: string[];

    if (isJar) {
      javaArgs = [
        '-XX:+FlightRecorder',
        `-XX:StartFlightRecording=duration=${duration}s,filename=${jfrPath}`,
        '-jar',
        scriptPath,
        ...args,
      ];
    } else if (isJava) {
      // Java 11+ can run .java files directly
      javaArgs = [
        '-XX:+FlightRecorder',
        `-XX:StartFlightRecording=duration=${duration}s,filename=${jfrPath}`,
        scriptPath,
        ...args,
      ];
    } else {
      // Assume it's a class name
      javaArgs = [
        '-XX:+FlightRecorder',
        `-XX:StartFlightRecording=duration=${duration}s,filename=${jfrPath}`,
        scriptPath,
        ...args,
      ];
    }

    // Run with JFR enabled
    const result = await spawnProcess('java', javaArgs, {
      timeout: (duration + 10) * 1000,
    });

    // Parse JFR file using jfr command (JDK 11+)
    const jfrPrint = await runCommand(
      { cmd: 'jfr', args: ['print', '--json', '--events', 'jdk.ExecutionSample', jfrPath] },
      { timeout: 30000 }
    );

    // If jfr print fails, try alternative approach
    if (jfrPrint.exitCode !== 0) {
      // Fallback: use basic timing data
      return {
        runtime: 'java',
        scriptPath,
        duration,
        topFunctions: [],
        summary: {
          totalTime: result.duration,
          totalFunctions: 0,
          samplesCollected: 0,
        },
      };
    }

    // Parse JFR JSON output
    const functions = parseJfrOutput(jfrPrint.stdout);

    return {
      runtime: 'java',
      scriptPath,
      duration,
      topFunctions: functions.slice(0, 10),
      summary: {
        totalTime: round(functions.reduce((sum, f) => sum + f.selfTime, 0), 2),
        totalFunctions: functions.length,
        samplesCollected: functions.reduce((sum, f) => sum + f.calls, 0),
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Parse JFR JSON output into function profiles
 */
function parseJfrOutput(jfrJson: string): FunctionProfile[] {
  try {
    const data = JSON.parse(jfrJson);
    const methodCounts = new Map<string, { count: number; file: string; line: number }>();

    // Aggregate execution samples
    for (const event of data.events || []) {
      if (event.type === 'jdk.ExecutionSample') {
        const stackTrace = event.values?.stackTrace;
        if (stackTrace?.frames) {
          for (const frame of stackTrace.frames) {
            const method = frame.method;
            if (method) {
              const key = `${method.type?.name || 'Unknown'}.${method.name || 'unknown'}`;
              const existing = methodCounts.get(key) || {
                count: 0,
                file: method.type?.name || 'Unknown',
                line: frame.lineNumber || 0,
              };
              existing.count++;
              methodCounts.set(key, existing);
            }
          }
        }
      }
    }

    // Convert to FunctionProfile array
    const totalSamples = Array.from(methodCounts.values()).reduce((sum, m) => sum + m.count, 0);
    const functions: FunctionProfile[] = [];

    for (const [name, data] of methodCounts) {
      functions.push({
        name,
        file: data.file,
        line: data.line,
        selfTime: data.count, // Using sample count as proxy for time
        totalTime: data.count,
        calls: data.count,
        percentage: round((data.count / totalSamples) * 100, 2),
      });
    }

    // Sort by sample count
    functions.sort((a, b) => b.selfTime - a.selfTime);

    return functions;
  } catch {
    return [];
  }
}

/**
 * Profile a specific Java method using JMH-style benchmarking
 */
export async function profileFunction(
  modulePath: string,
  functionName: string,
  args: unknown[] = [],
  iterations: number = 100
): Promise<ProfileFunctionResult> {
  const tempDir = await createTempDir('java-func-profile');

  // Extract class name and method name
  const parts = functionName.split('.');
  const methodName = parts.pop() || functionName;
  const className = parts.join('.') || basename(modulePath, '.java');

  // Validate identifiers to prevent code injection
  validateJavaIdentifier(className);
  validateJavaIdentifier(methodName);

  // Create a simple benchmark runner — className and methodName are validated identifiers
  const benchmarkCodeStr = `
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

public class Benchmark {
    public static void main(String[] args) throws Exception {
        Class<?> clazz = Class.forName("${className}");
        Object instance = clazz.getDeclaredConstructor().newInstance();
        Method method = clazz.getMethod("${methodName}");

        int iterations = ${iterations};
        int warmup = Math.min(10, iterations);
        List<Double> timings = new ArrayList<>();

        // Warmup
        for (int i = 0; i < warmup; i++) {
            method.invoke(instance);
        }

        // GC before measurement
        System.gc();

        Runtime runtime = Runtime.getRuntime();
        long memBefore = runtime.totalMemory() - runtime.freeMemory();

        // Measure
        for (int i = 0; i < iterations; i++) {
            long start = System.nanoTime();
            method.invoke(instance);
            timings.add((System.nanoTime() - start) / 1_000_000.0); // ms
        }

        long memAfter = runtime.totalMemory() - runtime.freeMemory();

        // Output as JSON
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\\"timings\\":[");
        for (int i = 0; i < timings.size(); i++) {
            if (i > 0) json.append(",");
            json.append(timings.get(i));
        }
        json.append("],");
        json.append("\\"memoryBefore\\":").append(memBefore).append(",");
        json.append("\\"memoryAfter\\":").append(memAfter);
        json.append("}");
        System.out.println(json.toString());
    }
}
`;

  const benchmarkPath = join(tempDir, 'Benchmark.java');

  try {
    await writeFile(benchmarkPath, benchmarkCodeStr);

    // Compile
    const compileResult = await runCommand(
      { cmd: 'javac', args: ['-cp', modulePath, benchmarkPath] },
      { timeout: 30000, cwd: tempDir }
    );

    if (compileResult.exitCode !== 0) {
      throw new Error(`Compilation failed: ${compileResult.stderr}`);
    }

    // Run
    const runResult = await runCommand(
      { cmd: 'java', args: ['-cp', `${modulePath}:${tempDir}`, 'Benchmark'] },
      { timeout: 120000, cwd: tempDir }
    );

    if (runResult.exitCode !== 0) {
      throw new Error(`Benchmark failed: ${runResult.stderr}`);
    }

    const data = JSON.parse(runResult.stdout);
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
        delta: data.memoryAfter - data.memoryBefore,
      },
    };
  } finally {
    await cleanupTempDir(tempDir);
  }
}

/**
 * Benchmark a Java script/jar file, or optionally inline Java code.
 *
 * Security note: executing raw, attacker-controlled Java code strings is
 * fundamentally unsafe regardless of any pattern-based blocklist (easily
 * bypassed via reflection, class-loading, Unicode escapes, etc.).
 * The API now accepts a `codeOrPath` pointing to an existing file on disk
 * (scriptPath mode, safe) and runs it directly via `java`.
 *
 * Raw-code execution is available only when the environment variable
 * PERF_PROFILER_ALLOW_RAW_CODE=1 is explicitly set by the server operator.
 * This opt-in must never be enabled in production or multi-tenant deployments.
 */
export async function benchmarkCode(
  codeOrPath: string,
  iterations: number = 1000,
  warmup: number = 100,
  /** When true, treat codeOrPath as a script path (default, safe). */
  isScriptPath: boolean = true
): Promise<BenchmarkResult> {
  if (isScriptPath) {
    // --- Safe path: benchmark an existing Java file/jar ---
    validateScriptPath(codeOrPath);

    const isJar = codeOrPath.endsWith('.jar');
    const javaArgs = isJar
      ? ['-jar', codeOrPath]
      : [codeOrPath];

    const startTime = Date.now();
    const result = await runCommand({ cmd: 'java', args: javaArgs }, {
      timeout: 300000,
    });
    const elapsed = Date.now() - startTime;

    if (result.exitCode !== 0) {
      throw new Error(`Benchmark script failed: ${result.stderr.slice(0, 500)}`);
    }

    // If the script emits {"timings":[...]} JSON on stdout, parse it;
    // otherwise report total elapsed time as a single measurement.
    try {
      const data = JSON.parse(result.stdout);
      if (Array.isArray(data.timings)) {
        const stats = calculateStats(data.timings);
        return { iterations, warmupIterations: warmup, timing: stats };
      }
    } catch {
      // Script does not emit structured timings — use elapsed time.
    }
    return {
      iterations: 1,
      warmupIterations: 0,
      timing: calculateStats([elapsed]),
    };
  }

  // --- Opt-in raw-code path (disabled by default) ---
  const allowRaw = process.env['PERF_PROFILER_ALLOW_RAW_CODE'] === '1';
  if (!allowRaw) {
    throw new Error(
      'Raw code execution is disabled. ' +
      'Pass a scriptPath instead, or set PERF_PROFILER_ALLOW_RAW_CODE=1 ' +
      'to opt-in (unsafe — only for trusted, single-user environments).'
    );
  }

  // Warn loudly that this mode is insecure.
  console.error(
    '[SECURITY WARNING] PERF_PROFILER_ALLOW_RAW_CODE is enabled. ' +
    'Raw Java code execution is unsafe in any multi-user or production environment.'
  );

  const tempDir = await createTempDir('java-benchmark');

  const benchmarkJavaCode = `
import java.util.ArrayList;
import java.util.List;

public class Benchmark {
    public static void benchmark() {
        ${codeOrPath}
    }

    public static void main(String[] args) {
        int iterations = ${iterations};
        int warmupIterations = ${warmup};
        List<Double> timings = new ArrayList<>();

        // Warmup
        for (int i = 0; i < warmupIterations; i++) {
            benchmark();
        }

        // Measure
        for (int i = 0; i < iterations; i++) {
            long start = System.nanoTime();
            benchmark();
            timings.add((System.nanoTime() - start) / 1_000_000.0); // ms
        }

        // Output as JSON
        StringBuilder json = new StringBuilder();
        json.append("{\\"timings\\":[");
        for (int i = 0; i < timings.size(); i++) {
            if (i > 0) json.append(",");
            json.append(timings.get(i));
        }
        json.append("]}");
        System.out.println(json.toString());
    }
}
`;

  const benchmarkPath = join(tempDir, 'Benchmark.java');

  try {
    await writeFile(benchmarkPath, benchmarkJavaCode);

    // Compile
    await runCommand(
      { cmd: 'javac', args: [benchmarkPath] },
      { timeout: 30000, cwd: tempDir }
    );

    // Run
    const result = await runCommand(
      { cmd: 'java', args: ['-cp', tempDir, 'Benchmark'] },
      { timeout: 300000 }
    );

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
 * Analyze memory usage of a Java application
 */
export async function analyzeMemory(
  scriptPath: string,
  snapshotInterval: number = 1000,
  duration: number = 10
): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);

  const isJar = scriptPath.endsWith('.jar');
  const snapshots: MemorySnapshot[] = [];
  const startTime = Date.now();

  // Start the Java process with GC logging
  const javaArgs = isJar
    ? ['-Xlog:gc*:stdout', '-jar', scriptPath]
    : ['-Xlog:gc*:stdout', scriptPath];

  const proc = spawnProcess('java', javaArgs, {
    timeout: (duration + 10) * 1000,
  });

  // Collect memory snapshots at intervals
  const intervalId = setInterval(async () => {
    // Use jcmd to get heap info if process is still running
    const jcmdResult = await runCommand('jcmd | head -1 | cut -d " " -f 1', {
      timeout: 1000,
      shell: true, // needs shell pipe
    });

    if (jcmdResult.stdout.trim()) {
      const pid = jcmdResult.stdout.trim();
      const heapInfo = await runCommand(
        { cmd: 'jcmd', args: [pid, 'GC.heap_info'] },
        { timeout: 5000 }
      );

      // Parse heap info
      const heapMatch = heapInfo.stdout.match(/used\s+(\d+)/);
      const totalMatch = heapInfo.stdout.match(/capacity\s+(\d+)/);

      if (heapMatch && totalMatch) {
        snapshots.push({
          timestamp: Date.now() - startTime,
          heapUsed: parseInt(heapMatch[1], 10),
          heapTotal: parseInt(totalMatch[1], 10),
        });
      }
    }
  }, snapshotInterval);

  // Wait for process to complete or timeout
  await proc;
  clearInterval(intervalId);

  // Analyze snapshots
  if (snapshots.length === 0) {
    // Create basic snapshot from process result
    snapshots.push({
      timestamp: 0,
      heapUsed: 0,
      heapTotal: 0,
    });
  }

  const heapValues = snapshots.map((s) => s.heapUsed);
  const initialHeap = heapValues[0] || 0;
  const finalHeap = heapValues[heapValues.length - 1] || 0;
  const peakHeap = Math.max(...heapValues, 0);
  const avgHeap = heapValues.length > 0
    ? heapValues.reduce((sum, v) => sum + v, 0) / heapValues.length
    : 0;
  const heapGrowth = finalHeap - initialHeap;

  const growthRate = heapGrowth / (duration * 1000);
  const detected = growthRate > 10000; // 10KB/ms for Java is suspicious

  return {
    runtime: 'java',
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
        ? `Heap grew by ${formatBytes(heapGrowth)} over ${duration}s`
        : undefined,
      growthRate: detected ? round(growthRate * 1000, 2) : undefined,
    },
  };
}

/**
 * Measure startup time of a Java application
 */
export async function measureStartup(
  scriptPath: string,
  runs: number = 5
): Promise<StartupResult> {
  validateScriptPath(scriptPath);

  const measurements: StartupMeasurement[] = [];
  const isJar = scriptPath.endsWith('.jar');

  for (let i = 0; i < runs; i++) {
    const javaArgs = isJar ? ['-jar', scriptPath] : [scriptPath];

    const result = await spawnProcess('java', javaArgs, {
      timeout: 60000, // Java startup can be slow
    });

    measurements.push({
      run: i + 1,
      totalTime: result.duration,
    });
  }

  const times = measurements.map((m) => m.totalTime);
  const stats = calculateStats(times);

  return {
    runtime: 'java',
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
 * Find performance bottlenecks in a Java application
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
      category: categorizeJavaBottleneck(f.name, f.file),
    }));

  const recommendations = generateJavaRecommendations(hotspots);

  return {
    runtime: 'java',
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

function categorizeJavaBottleneck(
  functionName: string,
  file: string
): 'cpu' | 'memory' | 'io' | 'gc' {
  const lowerName = functionName.toLowerCase();
  const lowerFile = file.toLowerCase();

  if (
    lowerName.includes('gc') ||
    lowerName.includes('collector') ||
    lowerFile.includes('gc')
  ) {
    return 'gc';
  }

  if (
    lowerName.includes('read') ||
    lowerName.includes('write') ||
    lowerName.includes('stream') ||
    lowerName.includes('socket') ||
    lowerFile.includes('io') ||
    lowerFile.includes('net') ||
    lowerFile.includes('nio')
  ) {
    return 'io';
  }

  if (
    lowerName.includes('alloc') ||
    lowerName.includes('array') ||
    lowerName.includes('buffer') ||
    lowerName.includes('collection')
  ) {
    return 'memory';
  }

  return 'cpu';
}

function generateJavaRecommendations(hotspots: Bottleneck[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const hotspot of hotspots) {
    switch (hotspot.category) {
      case 'gc':
        recommendations.push({
          issue: `High GC time in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider tuning GC with -XX:+UseG1GC, reducing object allocations, or using object pools',
          priority: hotspot.percentage > 20 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'io':
        recommendations.push({
          issue: `I/O bottleneck in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using NIO channels, buffered streams, connection pooling, or async I/O',
          priority: hotspot.percentage > 30 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'memory':
        recommendations.push({
          issue: `Memory-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Consider using primitive arrays, StringBuilder, or reducing collection resizing',
          priority: hotspot.percentage > 25 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'cpu':
        if (hotspot.percentage > 10) {
          recommendations.push({
            issue: `CPU-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
            suggestion:
              'Consider algorithm optimization, caching, parallel streams, or JIT warm-up',
            priority: hotspot.percentage > 30 ? 'high' : 'medium',
            relatedFunction: hotspot.function,
          });
        }
        break;
    }
  }

  return recommendations;
}
