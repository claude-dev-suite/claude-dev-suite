// SPDX-License-Identifier: MIT
/**
 * Process execution utilities for running external commands
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, realpathSync } from 'fs';
import { extname, isAbsolute } from 'path';
import type { ProcessResult, Runtime } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Execute a command and return stdout, stderr, and exit code.
 *
 * Preferred form: { cmd, args } — uses execFile (no shell), safe for any input.
 *
 * Legacy string form: the command string is split on whitespace and run via
 * execFile (no shell).  Only safe when no user-controlled data appears in the
 * command string.  Commands that require shell pipelines (|, >, 2>/dev/null)
 * must pass shell:true in options and take responsibility for input sanitisation.
 *
 * Security: never pass user-supplied strings through the legacy string path
 * without shell:false (the default).
 */
export async function runCommand(
  command: string | { cmd: string; args: string[] },
  options: {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
    /** Allow shell pipelines (|, >, etc.).  Only set for trusted internal commands. */
    shell?: boolean;
  } = {}
): Promise<ProcessResult> {
  const startTime = Date.now();

  // Shell pipeline path: trusted internal commands that need shell features
  if (options.shell === true && typeof command === 'string') {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: options.timeout || 60000,
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
      });
      return { stdout, stderr, exitCode: 0, duration: Date.now() - startTime };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      if (error && typeof error === 'object') {
        const e = error as { stdout?: string; stderr?: string; code?: number; message?: string };
        return {
          stdout: e.stdout || '',
          stderr: e.stderr || e.message || 'Command failed',
          exitCode: e.code || 1,
          duration,
        };
      }
      return { stdout: '', stderr: String(error), exitCode: 1, duration };
    }
  }

  // Resolve cmd + args for execFile (no shell)
  let cmd: string;
  let args: string[];
  if (typeof command === 'object' && 'cmd' in command) {
    cmd = command.cmd;
    args = command.args;
  } else {
    // Legacy string path: split on whitespace.  Only safe for trusted
    // internal commands where no user data reaches the argument list.
    const parts = (command as string).split(/\s+/);
    cmd = parts[0];
    args = parts.slice(1);
  }

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
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
  // Use structured argv to avoid shell invocation
  const commands: Record<Runtime, { cmd: string; args: string[] }> = {
    nodejs: { cmd: 'node', args: ['--version'] },
    java:   { cmd: 'java', args: ['-version'] },
    python: { cmd: 'python3', args: ['--version'] },
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
 * Validate that a script file path is safe and the file exists.
 *
 * Hardened checks:
 *  - Must be an absolute path (no relative traversal)
 *  - Must not contain null bytes (guard against CVE-style tricks)
 *  - File must exist and be accessible (realpathSync succeeds)
 *
 * Note on symlink confinement: this function does NOT enforce confinement
 * to a particular allowed root directory.  The tool is designed for
 * single-user local profiling where the operator controls what files are
 * passed.  realpathSync is called only to verify accessibility; no
 * symlink-escape rejection is performed (a hollow check was previously
 * present and has been removed to avoid false security claims).
 */
export function validateScriptPath(scriptPath: string): void {
  if (!scriptPath || typeof scriptPath !== 'string') {
    throw new Error('Script path must be a non-empty string');
  }

  // Reject null bytes
  if (scriptPath.includes('\0')) {
    throw new Error('Script path must not contain null bytes');
  }

  // Require absolute path
  if (!isAbsolute(scriptPath)) {
    throw new Error(`Script path must be absolute, got: "${scriptPath}"`);
  }

  // File must exist
  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  // Verify the file is accessible (resolves without error)
  try {
    realpathSync(scriptPath);
  } catch {
    throw new Error(`Script path is not accessible: "${scriptPath}"`);
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
