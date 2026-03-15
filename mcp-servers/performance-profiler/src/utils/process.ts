// SPDX-License-Identifier: MIT
/**
 * Process execution utilities for running external commands
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { extname } from 'path';
import type { ProcessResult, Runtime } from '../types.js';

const execAsync = promisify(exec);

/**
 * Execute a command and return stdout, stderr, and exit code
 */
export async function runCommand(
  command: string,
  options: {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
  } = {}
): Promise<ProcessResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large profiles
      timeout: options.timeout || 60000, // 60s default
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    if (error && typeof error === 'object') {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || execError.message || 'Command failed',
        exitCode: execError.code || 1,
        duration,
      };
    }
    return {
      stdout: '',
      stderr: String(error),
      exitCode: 1,
      duration,
    };
  }
}

/**
 * Spawn a process and capture output with timeout
 */
export async function spawnProcess(
  command: string,
  args: string[],
  options: {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
  } = {}
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: process.platform === 'win32',
    });

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, options.timeout || 60000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr: killed ? stderr + '\nProcess killed due to timeout' : stderr,
        exitCode: code ?? 1,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Detect runtime from file extension
 */
export function detectRuntime(filePath: string): Runtime {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.ts':
    case '.mts':
    case '.cts':
      return 'nodejs';
    case '.java':
    case '.jar':
    case '.class':
      return 'java';
    case '.py':
    case '.pyw':
      return 'python';
    default:
      // Try to detect from shebang or default to nodejs
      return 'nodejs';
  }
}

/**
 * Check if a runtime is available on the system
 */
export async function checkRuntimeAvailable(runtime: Runtime): Promise<boolean> {
  const commands: Record<Runtime, string> = {
    nodejs: 'node --version',
    java: 'java -version',
    python: 'python3 --version || python --version',
  };

  const result = await runCommand(commands[runtime], { timeout: 5000 });
  return result.exitCode === 0;
}

/**
 * Get the command to run a script for a given runtime
 */
export function getRunCommand(runtime: Runtime, scriptPath: string, args: string[] = []): {
  command: string;
  args: string[];
} {
  const argsStr = args.length > 0 ? args : [];

  switch (runtime) {
    case 'nodejs':
      if (scriptPath.endsWith('.ts')) {
        return { command: 'npx', args: ['tsx', scriptPath, ...argsStr] };
      }
      return { command: 'node', args: [scriptPath, ...argsStr] };

    case 'java':
      if (scriptPath.endsWith('.jar')) {
        return { command: 'java', args: ['-jar', scriptPath, ...argsStr] };
      }
      if (scriptPath.endsWith('.java')) {
        // Java 11+ can run .java files directly
        return { command: 'java', args: [scriptPath, ...argsStr] };
      }
      // Assume class file
      return { command: 'java', args: [scriptPath.replace('.class', ''), ...argsStr] };

    case 'python':
      return { command: 'python3', args: [scriptPath, ...argsStr] };

    default:
      return { command: 'node', args: [scriptPath, ...argsStr] };
  }
}

/**
 * Validate that a script file exists
 */
export function validateScriptPath(scriptPath: string): void {
  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
}

/**
 * Create a temporary directory for profiling output
 */
export async function createTempDir(prefix: string): Promise<string> {
  const { mkdtemp } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  const { rm } = await import('fs/promises');
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
