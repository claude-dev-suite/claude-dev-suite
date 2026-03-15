// SPDX-License-Identifier: MIT
/**
 * Process Finder
 * Utilities for finding Java/Node.js processes by port or name
 */

import { runCommand } from '../utils/process.js';

export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  port?: number;
}

/**
 * Find Java process by port number
 * Uses lsof/netstat to find PID listening on port, then jps to verify it's Java
 */
export async function findJavaProcessByPort(port: number): Promise<ProcessInfo | null> {
  // First, find PID listening on the port
  const pid = await findPidByPort(port);
  if (!pid) return null;

  // Verify it's a Java process using jps
  const jpsResult = await runCommand('jps -l', { timeout: 5000 });
  if (jpsResult.exitCode !== 0) {
    throw new Error('jps command not available. Is JDK installed?');
  }

  const lines = jpsResult.stdout.trim().split('\n');
  for (const line of lines) {
    const [jpsPid, ...nameParts] = line.trim().split(/\s+/);
    if (parseInt(jpsPid, 10) === pid) {
      return {
        pid,
        name: nameParts.join(' ') || 'java',
        command: `java ${nameParts.join(' ')}`,
        port,
      };
    }
  }

  return null;
}

/**
 * Find any process by port number
 */
export async function findPidByPort(port: number): Promise<number | null> {
  // Try lsof first (Linux/macOS)
  const lsofResult = await runCommand(`lsof -i :${port} -t 2>/dev/null | head -1`, {
    timeout: 5000,
  });

  if (lsofResult.exitCode === 0 && lsofResult.stdout.trim()) {
    const pid = parseInt(lsofResult.stdout.trim(), 10);
    if (!isNaN(pid)) return pid;
  }

  // Try ss (Linux)
  const ssResult = await runCommand(
    `ss -tlnp 2>/dev/null | grep :${port} | grep -oP 'pid=\\K\\d+'`,
    { timeout: 5000 }
  );

  if (ssResult.exitCode === 0 && ssResult.stdout.trim()) {
    const pid = parseInt(ssResult.stdout.trim(), 10);
    if (!isNaN(pid)) return pid;
  }

  // Try netstat (fallback)
  const netstatResult = await runCommand(
    `netstat -tlnp 2>/dev/null | grep :${port} | awk '{print $7}' | cut -d'/' -f1`,
    { timeout: 5000 }
  );

  if (netstatResult.exitCode === 0 && netstatResult.stdout.trim()) {
    const pid = parseInt(netstatResult.stdout.trim(), 10);
    if (!isNaN(pid)) return pid;
  }

  return null;
}

/**
 * Find Java process by name pattern
 */
export async function findJavaProcessByName(pattern: string): Promise<ProcessInfo | null> {
  const jpsResult = await runCommand('jps -l', { timeout: 5000 });
  if (jpsResult.exitCode !== 0) {
    throw new Error('jps command not available. Is JDK installed?');
  }

  const lines = jpsResult.stdout.trim().split('\n');
  const lowerPattern = pattern.toLowerCase();

  for (const line of lines) {
    const [pid, ...nameParts] = line.trim().split(/\s+/);
    const name = nameParts.join(' ');

    if (name.toLowerCase().includes(lowerPattern)) {
      return {
        pid: parseInt(pid, 10),
        name,
        command: `java ${name}`,
      };
    }
  }

  return null;
}

/**
 * List all running Java processes
 */
export async function listJavaProcesses(): Promise<ProcessInfo[]> {
  const jpsResult = await runCommand('jps -l', { timeout: 5000 });
  if (jpsResult.exitCode !== 0) {
    return [];
  }

  const processes: ProcessInfo[] = [];
  const lines = jpsResult.stdout.trim().split('\n');

  for (const line of lines) {
    const [pid, ...nameParts] = line.trim().split(/\s+/);
    const name = nameParts.join(' ');

    // Skip jps itself
    if (name.includes('Jps') || name === 'jps') continue;

    processes.push({
      pid: parseInt(pid, 10),
      name: name || 'java',
      command: `java ${name}`,
    });
  }

  return processes;
}

/**
 * Find Node.js process by port number
 */
export async function findNodeProcessByPort(port: number): Promise<ProcessInfo | null> {
  const pid = await findPidByPort(port);
  if (!pid) return null;

  // Verify it's a Node.js process
  const psResult = await runCommand(`ps -p ${pid} -o comm=`, { timeout: 5000 });
  if (psResult.exitCode === 0) {
    const comm = psResult.stdout.trim();
    if (comm.includes('node') || comm.includes('nodejs')) {
      // Get full command line
      const cmdResult = await runCommand(`ps -p ${pid} -o args=`, { timeout: 5000 });
      return {
        pid,
        name: 'node',
        command: cmdResult.stdout.trim() || 'node',
        port,
      };
    }
  }

  return null;
}

/**
 * Check if a process is still running
 */
export async function isProcessRunning(pid: number): Promise<boolean> {
  const result = await runCommand(`kill -0 ${pid} 2>/dev/null`, { timeout: 1000 });
  return result.exitCode === 0;
}

/**
 * Get process info by PID
 */
export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
  const psResult = await runCommand(`ps -p ${pid} -o comm=,args=`, { timeout: 5000 });
  if (psResult.exitCode !== 0) return null;

  const output = psResult.stdout.trim();
  const [comm, ...args] = output.split(/\s+/);

  return {
    pid,
    name: comm || 'unknown',
    command: output,
  };
}

/**
 * Auto-detect process type and find it
 */
export async function findProcess(options: {
  pid?: number;
  port?: number;
  name?: string;
  runtime?: 'java' | 'nodejs' | 'auto';
}): Promise<ProcessInfo | null> {
  const { pid, port, name, runtime = 'auto' } = options;

  // If PID is provided directly
  if (pid) {
    return getProcessInfo(pid);
  }

  // If port is provided
  if (port) {
    if (runtime === 'java' || runtime === 'auto') {
      const javaProcess = await findJavaProcessByPort(port);
      if (javaProcess) return javaProcess;
    }

    if (runtime === 'nodejs' || runtime === 'auto') {
      const nodeProcess = await findNodeProcessByPort(port);
      if (nodeProcess) return nodeProcess;
    }

    // Fallback: any process on port
    const anyPid = await findPidByPort(port);
    if (anyPid) {
      return getProcessInfo(anyPid);
    }
  }

  // If name pattern is provided
  if (name) {
    if (runtime === 'java' || runtime === 'auto') {
      const javaProcess = await findJavaProcessByName(name);
      if (javaProcess) return javaProcess;
    }
  }

  return null;
}
