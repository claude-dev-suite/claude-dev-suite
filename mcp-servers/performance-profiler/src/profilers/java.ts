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
    const jfrPrint = await runCommand(`jfr print --json --events jdk.ExecutionSample ${jfrPath}`, {
      timeout: 30000,
    });

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

  // Create a simple benchmark runner
  const benchmarkCode = `
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
    await writeFile(benchmarkPath, benchmarkCode);

    // Compile
    const compileResult = await runCommand(`javac -cp "${modulePath}" ${benchmarkPath}`, {
      timeout: 30000,
      cwd: tempDir,
    });

    if (compileResult.exitCode !== 0) {
      throw new Error(`Compilation failed: ${compileResult.stderr}`);
    }

    // Run
    const runResult = await runCommand(`java -cp "${modulePath}:${tempDir}" Benchmark`, {
      timeout: 120000,
      cwd: tempDir,
    });

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
 * Benchmark inline Java code
 */
export async function benchmarkCode(
  code: string,
  iterations: number = 1000,
  warmup: number = 100
): Promise<BenchmarkResult> {
  const tempDir = await createTempDir('java-benchmark');

  const benchmarkCode = `
import java.util.ArrayList;
import java.util.List;

public class Benchmark {
    public static void benchmark() {
        ${code}
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
    await writeFile(benchmarkPath, benchmarkCode);

    // Compile
    await runCommand(`javac ${benchmarkPath}`, {
      timeout: 30000,
      cwd: tempDir,
    });

    // Run
    const result = await runCommand(`java -cp ${tempDir} Benchmark`, {
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
    });

    if (jcmdResult.stdout.trim()) {
      const pid = jcmdResult.stdout.trim();
      const heapInfo = await runCommand(`jcmd ${pid} GC.heap_info`, {
        timeout: 5000,
      });

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
