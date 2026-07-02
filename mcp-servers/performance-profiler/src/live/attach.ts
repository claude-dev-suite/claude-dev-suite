// SPDX-License-Identifier: MIT
/**
 * Live Process Profiler Attachment
 * Attaches JFR to running Java processes
 */

import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { runCommand, createTempDir, cleanupTempDir } from '../utils/process.js';
import { findProcess, isProcessRunning, type ProcessInfo } from './process-finder.js';
import type { FunctionProfile, BottlenecksResult, Bottleneck, Recommendation } from '../types.js';
import { round } from '../utils/statistics.js';

export interface AttachProfilerInput {
  pid?: number;
  port?: number;
  processName?: string;
  duration: number; // seconds
}

export interface AttachProfilerResult {
  process: ProcessInfo;
  duration: number;
  jfrFile?: string;
  topFunctions: FunctionProfile[];
  summary: {
    totalSamples: number;
    totalFunctions: number;
    profilingTime: number;
  };
  error?: string;
}

/**
 * Attach JFR to a running Java process and profile it
 */
export async function attachProfiler(input: AttachProfilerInput): Promise<AttachProfilerResult> {
  const { pid, port, processName, duration } = input;

  // Find the process
  const process = await findProcess({
    pid,
    port,
    name: processName,
    runtime: 'java',
  });

  if (!process) {
    throw new Error(
      `Could not find Java process. ` +
      `Searched by: ${pid ? `PID ${pid}` : ''} ${port ? `port ${port}` : ''} ${processName ? `name "${processName}"` : ''}`
    );
  }

  // Verify process is still running
  if (!(await isProcessRunning(process.pid))) {
    throw new Error(`Process ${process.pid} is no longer running`);
  }

  const tempDir = await createTempDir('jfr-attach');
  const jfrPath = join(tempDir, 'recording.jfr');

  try {
    // Start JFR recording
    console.error(`Attaching JFR to process ${process.pid} (${process.name}) for ${duration}s...`);

    const startResult = await runCommand(
      {
        cmd: 'jcmd',
        args: [
          String(process.pid),
          'JFR.start',
          `duration=${duration}s`,
          `filename=${jfrPath}`,
          'settings=profile',
        ],
      },
      { timeout: 10000 }
    );

    if (startResult.exitCode !== 0) {
      throw new Error(`Failed to start JFR: ${startResult.stderr}`);
    }

    // Wait for recording to complete
    console.error(`Recording for ${duration} seconds...`);
    await sleep(duration * 1000 + 2000); // Add 2s buffer

    // Check if recording finished
    const checkResult = await runCommand(
      { cmd: 'jcmd', args: [String(process.pid), 'JFR.check'] },
      { timeout: 5000 }
    );
    console.error(`JFR status: ${checkResult.stdout}`);

    // Parse the JFR file
    const topFunctions = await parseJfrFile(jfrPath);

    return {
      process,
      duration,
      jfrFile: jfrPath,
      topFunctions: topFunctions.slice(0, 20),
      summary: {
        totalSamples: topFunctions.reduce((sum, f) => sum + f.calls, 0),
        totalFunctions: topFunctions.length,
        profilingTime: duration,
      },
    };
  } catch (error) {
    // Try to stop any running recording
    await runCommand({ cmd: 'jcmd', args: [String(process.pid), 'JFR.stop'] }, { timeout: 5000 }).catch(() => {});

    throw error;
  } finally {
    // Cleanup is optional - keep JFR file for manual analysis
    // await cleanupTempDir(tempDir);
  }
}

/**
 * Parse JFR file and extract function profiles
 */
async function parseJfrFile(jfrPath: string): Promise<FunctionProfile[]> {
  // Use jfr print to get execution samples
  const result = await runCommand(
    { cmd: 'jfr', args: ['print', '--json', '--events', 'jdk.ExecutionSample', jfrPath] },
    { timeout: 60000 }
  );

  if (result.exitCode !== 0) {
    console.error(`JFR parse warning: ${result.stderr}`);
    return [];
  }

  try {
    const data = JSON.parse(result.stdout);
    const events = data.recording?.events || [];

    // Aggregate by method
    const methodCounts = new Map<string, {
      count: number;
      file: string;
      line: number;
    }>();

    for (const event of events) {
      const frames = event.values?.stackTrace?.frames || [];

      // Count top-of-stack (self time)
      if (frames.length > 0) {
        const frame = frames[0];
        const method = frame.method;
        if (method) {
          const className = method.type?.name || 'Unknown';
          const methodName = method.name || 'unknown';

          // Skip JVM internal methods
          if (className.startsWith('jdk/') || className.startsWith('java/lang/Thread')) {
            continue;
          }

          const key = `${className}.${methodName}`;
          const existing = methodCounts.get(key) || {
            count: 0,
            file: className.replace(/\//g, '.'),
            line: frame.lineNumber || 0,
          };
          existing.count++;
          methodCounts.set(key, existing);
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
        selfTime: data.count, // Using sample count as proxy
        totalTime: data.count,
        calls: data.count,
        percentage: round((data.count / totalSamples) * 100, 2),
      });
    }

    // Sort by sample count
    functions.sort((a, b) => b.selfTime - a.selfTime);

    return functions;
  } catch (error) {
    console.error('Failed to parse JFR JSON:', error);
    return [];
  }
}

/**
 * Attach profiler and analyze bottlenecks
 */
export async function attachAndFindBottlenecks(
  input: AttachProfilerInput,
  threshold: number = 5
): Promise<BottlenecksResult> {
  const profileResult = await attachProfiler(input);

  const hotspots: Bottleneck[] = profileResult.topFunctions
    .filter((f) => f.percentage >= threshold)
    .map((f) => ({
      function: f.name,
      file: f.file,
      line: f.line,
      selfTime: f.selfTime,
      percentage: f.percentage,
      category: categorizeJavaMethod(f.name, f.file),
    }));

  const recommendations = generateRecommendations(hotspots);

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

/**
 * Categorize Java method by name and class
 */
function categorizeJavaMethod(
  methodName: string,
  className: string
): 'cpu' | 'memory' | 'io' | 'gc' {
  const lowerMethod = methodName.toLowerCase();
  const lowerClass = className.toLowerCase();

  // GC related
  if (
    lowerMethod.includes('gc') ||
    lowerClass.includes('gc') ||
    lowerMethod.includes('finalize')
  ) {
    return 'gc';
  }

  // I/O related
  if (
    lowerMethod.includes('read') ||
    lowerMethod.includes('write') ||
    lowerMethod.includes('flush') ||
    lowerMethod.includes('socket') ||
    lowerClass.includes('stream') ||
    lowerClass.includes('channel') ||
    lowerClass.includes('jdbc') ||
    lowerClass.includes('hibernate') ||
    lowerClass.includes('jpa') ||
    lowerClass.includes('repository')
  ) {
    return 'io';
  }

  // Memory related
  if (
    lowerMethod.includes('alloc') ||
    lowerMethod.includes('copy') ||
    lowerMethod.includes('clone') ||
    lowerClass.includes('buffer') ||
    lowerClass.includes('array')
  ) {
    return 'memory';
  }

  return 'cpu';
}

/**
 * Generate optimization recommendations
 */
function generateRecommendations(hotspots: Bottleneck[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const hotspot of hotspots) {
    const lowerName = hotspot.function.toLowerCase();

    // Specific pattern detection
    if (lowerName.includes('findby') || lowerName.includes('findall')) {
      recommendations.push({
        issue: `Database query in ${hotspot.function} (${hotspot.percentage}%)`,
        suggestion:
          'Check for N+1 queries, missing indexes, or consider adding @Query with JOIN FETCH',
        priority: hotspot.percentage > 20 ? 'high' : 'medium',
        relatedFunction: hotspot.function,
      });
      continue;
    }

    if (lowerName.includes('save') || lowerName.includes('persist')) {
      recommendations.push({
        issue: `Database write in ${hotspot.function} (${hotspot.percentage}%)`,
        suggestion:
          'Consider batch inserts with saveAll(), or use @Modifying for bulk updates',
        priority: hotspot.percentage > 15 ? 'high' : 'medium',
        relatedFunction: hotspot.function,
      });
      continue;
    }

    // Category-based recommendations
    switch (hotspot.category) {
      case 'gc':
        recommendations.push({
          issue: `High GC time in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Reduce object allocations, consider object pooling, or tune GC with -XX:+UseG1GC',
          priority: hotspot.percentage > 20 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'io':
        recommendations.push({
          issue: `I/O bottleneck in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Use connection pooling, batch operations, or add caching with @Cacheable',
          priority: hotspot.percentage > 30 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'memory':
        recommendations.push({
          issue: `Memory-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
          suggestion:
            'Use streaming for large data, avoid large collections in memory',
          priority: hotspot.percentage > 25 ? 'high' : 'medium',
          relatedFunction: hotspot.function,
        });
        break;

      case 'cpu':
        if (hotspot.percentage > 10) {
          recommendations.push({
            issue: `CPU-intensive operation in ${hotspot.function} (${hotspot.percentage}%)`,
            suggestion:
              'Optimize algorithm, add caching, or consider async processing with @Async',
            priority: hotspot.percentage > 30 ? 'high' : 'medium',
            relatedFunction: hotspot.function,
          });
        }
        break;
    }
  }

  return recommendations;
}

/**
 * Helper: sleep for ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
