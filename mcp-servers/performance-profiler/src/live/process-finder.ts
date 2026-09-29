// SPDX-License-Identifier: MIT
/**
 * Process discovery by PID, port or name — without shell pipelines. The old
 * implementation ran `lsof | head`, `ss | grep -oP` and `kill -0 … 2>/dev/null`
 * through /bin/sh, none of which exist on Windows.
 */

import { isPidAlive, runCommand } from '../utils/process.js';

const IS_WIN = process.platform === 'win32';

export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  port?: number;
}

/** Parse `netstat -ano -p TCP` (Windows) for a LISTENING socket on `port`. */
export function parseNetstatListening(text: string, port: number): number | null {
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    // Proto  Local Address  Foreign Address  State  PID
    if (cols.length < 5 || !/^TCP/i.test(cols[0])) continue;
    const local = cols[1];
    const p = Number(local.slice(local.lastIndexOf(':') + 1));
    if (p === port && /LISTEN/i.test(cols[3])) {
      const pid = Number(cols[4]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
  }
  return null;
}

/** Parse `ss -ltnpH` output for the PID listening on `port`. */
export function parseSsListening(text: string, port: number): number | null {
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    const local = cols[3];
    if (Number(local.slice(local.lastIndexOf(':') + 1)) !== port) continue;
    const m = line.match(/pid=(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** PID listening on a TCP port, or null. */
export async function findPidByPort(port: number): Promise<number | null> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
  if (IS_WIN) {
    const r = await runCommand({ cmd: 'netstat', args: ['-ano', '-p', 'TCP'] }, { timeout: 10_000 });
    const r6 = await runCommand({ cmd: 'netstat', args: ['-ano', '-p', 'TCPv6'] }, { timeout: 10_000 });
    return parseNetstatListening(r.stdout, port) ?? parseNetstatListening(r6.stdout, port);
  }
  const lsof = await runCommand({ cmd: 'lsof', args: ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'] }, { timeout: 10_000 });
  const first = lsof.stdout.split(/\s+/).find((s) => /^\d+$/.test(s));
  if (lsof.exitCode === 0 && first) return Number(first);
  const ss = await runCommand({ cmd: 'ss', args: ['-ltnpH'] }, { timeout: 10_000 });
  if (ss.exitCode === 0) return parseSsListening(ss.stdout, port);
  return null;
}

export async function isProcessRunning(pid: number): Promise<boolean> {
  return isPidAlive(pid);
}

/** Name and command line of a PID. */
export async function getProcessInfo(pid: number): Promise<ProcessInfo | null> {
  if (!isPidAlive(pid)) return null;
  if (IS_WIN) {
    const r = await runCommand({ cmd: 'tasklist', args: ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'] }, { timeout: 10_000 });
    const m = r.stdout.match(/^"([^"]+)","(\d+)"/m);
    return { pid, name: m ? m[1] : 'unknown', command: m ? m[1] : 'unknown' };
  }
  const r = await runCommand({ cmd: 'ps', args: ['-p', String(pid), '-o', 'comm=', '-o', 'args='] }, { timeout: 5000 });
  const out = r.stdout.trim();
  if (!out) return { pid, name: 'unknown', command: 'unknown' };
  const [comm] = out.split(/\s+/);
  return { pid, name: comm, command: out };
}

/** `jps -l` → Java processes (the jps tool itself excluded). */
export function parseJps(text: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s*(.*)$/);
    if (!m) continue;
    const name = m[2].trim();
    if (/(^|\.)Jps$/.test(name) || name === 'jps') continue;
    out.push({ pid: Number(m[1]), name: name || 'java', command: `java ${name}`.trim() });
  }
  return out;
}

export async function listJavaProcesses(): Promise<ProcessInfo[]> {
  const r = await runCommand({ cmd: 'jps', args: ['-l'] }, { timeout: 15_000 });
  if (r.exitCode !== 0) {
    throw new Error(`jps is not available (${r.spawnError ?? r.stderr.trim()}). It ships with a full JDK; add $JAVA_HOME/bin to PATH.`);
  }
  return parseJps(r.stdout);
}

export async function findJavaProcessByName(pattern: string): Promise<ProcessInfo | null> {
  const lower = pattern.toLowerCase();
  return (await listJavaProcesses()).find((p) => p.name.toLowerCase().includes(lower)) ?? null;
}

/** Resolve a target from pid / port / name. */
export async function findProcess(options: { pid?: number; port?: number; name?: string; runtime?: string }): Promise<ProcessInfo | null> {
  const { pid, port, name } = options;
  if (pid) return getProcessInfo(pid);
  if (port) {
    const p = await findPidByPort(port);
    if (p) {
      const info = await getProcessInfo(p);
      return info ? { ...info, port } : null;
    }
  }
  if (name && (options.runtime ?? 'java') === 'java') return findJavaProcessByName(name);
  return null;
}
