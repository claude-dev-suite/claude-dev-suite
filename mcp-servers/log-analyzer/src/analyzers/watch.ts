// SPDX-License-Identifier: MIT
/**
 * Log watcher: follows a file like `tail -F`.
 *
 *  - Partial lines: bytes after the last newline are kept until the line is
 *    complete (decoding only whole lines, so a UTF-8 sequence split across two
 *    reads is never mangled). A partial line over 1 MB is emitted as-is.
 *  - Multiline: the same decoder as the batch tools (envelope → parser →
 *    assembler), so stack traces arrive as one entry; a pending entry is
 *    flushed once the file has been idle for two poll intervals.
 *  - Rotation: a new inode/device (rename-and-recreate) drains the old file
 *    descriptor to its end before switching; a shrinking file (copytruncate)
 *    restarts from 0; a missing file is waited for.
 *  - Bounded: entry ring (≤ 5000), alert ring (≤ 200), per-rule match windows.
 *  - Alert rules: regex and/or levels with an optional count threshold over a
 *    sliding window; their state is reported by `status`.
 *  - Timers are unref'd, and stopAllWatchers() closes every descriptor; the
 *    server calls it on SIGINT/SIGTERM/stdin close and then exits.
 */

import { open, stat, type FileHandle } from 'fs/promises';
import type { LogEntry, LogFormat, LogLevel, WatchAlert } from '../types.js';
import { detectFormat, type Detection } from '../parsers/index.js';
import { Decoder } from '../pipeline/index.js';
import { emptyLevelCounts, isErrorLevel } from '../core/levels.js';
import { readHead } from '../sources/files.js';
import { safeRegex } from '../utils.js';
import { serializeEntry } from './output.js';

export interface AlertRuleInput {
  name?: string;
  pattern?: string;
  levels?: LogLevel[];
  /** Fire when at least this many matches occur within windowSeconds (default 1). */
  threshold?: number;
  windowSeconds?: number;
}

export interface WatchOptions {
  filePath: string;
  format?: LogFormat;
  customPattern?: string;
  filter?: string;
  levels?: LogLevel[];
  alertPatterns?: string[];
  alertLevels?: LogLevel[];
  alertRules?: AlertRuleInput[];
  pollInterval?: number;
  maxEntries?: number;
  fromStart?: boolean;
  /** Internal: false disables the timer (tests drive pollOnce()). */
  autoPoll?: boolean;
}

const MAX_WATCHERS = 20;
const MAX_ENTRIES = 5000;
const MAX_ALERTS = 200;
const MAX_PARTIAL_BYTES = 1024 * 1024;
const MAX_READ_PER_POLL = 8 * 1024 * 1024;
const CHUNK = 1024 * 1024;

interface Rule {
  name: string;
  re?: RegExp;
  levels?: LogLevel[];
  threshold: number;
  windowMs: number;
  hits: number[];
  matchesTotal: number;
  fireCount: number;
  lastFiredAt: Date | null;
}

const activeWatchers = new Map<string, LogWatcher>();

export class LogWatcher {
  readonly filePath: string;
  private readonly requestedFormat: LogFormat;
  private readonly customPattern?: string;
  private readonly filter?: RegExp;
  private readonly levels?: LogLevel[];
  private readonly rules: Rule[];
  private readonly pollInterval: number;
  private readonly maxEntries: number;

  private fh: FileHandle | null = null;
  private ino: number | null = null;
  private dev: number | null = null;
  private position = 0;
  private partial: Buffer = Buffer.alloc(0);
  private decoder: Decoder | null = null;
  private detection: Detection | null = null;
  private pendingSample: string[] = [];
  private lineNumber = 0;
  private lastDataAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  state: 'watching' | 'waiting-for-file' | 'stopped' = 'stopped';
  readonly startedAt = new Date();
  entriesProcessed = 0;
  entriesMatched = 0;
  bytesRead = 0;
  linesRead = 0;
  rotations = 0;
  truncations = 0;
  lastError: string | null = null;
  private entries: LogEntry[] = [];
  private alerts: WatchAlert[] = [];
  alertsTriggered = 0;
  private levelCounts = emptyLevelCounts();
  private errorTimes: number[] = [];

  constructor(o: WatchOptions) {
    this.filePath = o.filePath;
    this.requestedFormat = o.format ?? 'auto';
    this.customPattern = o.customPattern;
    this.filter = o.filter ? safeRegex(o.filter, 'i') : undefined;
    this.levels = o.levels;
    this.pollInterval = Math.min(Math.max(o.pollInterval ?? 1000, 100), 60000);
    this.maxEntries = Math.min(Math.max(o.maxEntries ?? 1000, 10), MAX_ENTRIES);
    const rules: Rule[] = [];
    const mk = (r: AlertRuleInput, fallbackName: string): Rule => ({
      name: r.name ?? fallbackName,
      re: r.pattern ? safeRegex(r.pattern, 'i') : undefined,
      levels: r.levels?.length ? r.levels : undefined,
      threshold: Math.max(1, Math.floor(r.threshold ?? 1)),
      windowMs: Math.max(1, r.windowSeconds ?? 60) * 1000,
      hits: [], matchesTotal: 0, fireCount: 0, lastFiredAt: null,
    });
    for (const [i, r] of (o.alertRules ?? []).entries()) {
      if (!r.pattern && !r.levels?.length) throw new Error(`alertRules[${i}] needs a pattern and/or levels`);
      rules.push(mk(r, `rule-${i + 1}`));
    }
    const alertLevels = o.alertLevels ?? (o.alertRules?.length ? [] : ['ERROR', 'FATAL']);
    if (alertLevels.length) rules.push(mk({ levels: alertLevels }, `level:${alertLevels.join('|')}`));
    for (const p of o.alertPatterns ?? []) rules.push(mk({ pattern: p }, `pattern:${p}`));
    this.rules = rules;
    this.fromStart = o.fromStart ?? false;
    this.autoPoll = o.autoPoll ?? true;
  }

  private readonly fromStart: boolean;
  private readonly autoPoll: boolean;
  /** Polls are serialised: a timer poll and an explicit one never read the same bytes twice. */
  private chain: Promise<void> = Promise.resolve();

  async start(): Promise<void> {
    await this.openFile(this.fromStart ? 'start' : 'end');
    if (this.autoPoll) this.schedule(0);
  }

  private async openFile(at: 'start' | 'end'): Promise<boolean> {
    try {
      this.fh = await open(this.filePath, 'r');
      const st = await this.fh.stat();
      this.ino = st.ino;
      this.dev = st.dev;
      this.position = at === 'end' ? st.size : 0;
      this.partial = Buffer.alloc(0);
      this.state = 'watching';
      if (!this.detection) await this.detectFromHead(st.size);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.state = 'waiting-for-file';
        return false;
      }
      throw err;
    }
  }

  private async detectFromHead(size: number): Promise<void> {
    if (size === 0 && this.requestedFormat === 'auto') return; // detect on first data
    const head = size > 0 ? await readHead(this.filePath) : [];
    this.setDetection(detectFormat(head, { format: this.requestedFormat, customPattern: this.customPattern }));
  }

  private setDetection(d: Detection): void {
    this.detection = d;
    this.decoder = new Decoder(d, this.filePath, this.customPattern);
    const sample = this.pendingSample;
    this.pendingSample = [];
    for (const line of sample) this.feedLine(line);
  }

  private schedule(ms: number): void {
    if (this.state === 'stopped' || !this.autoPoll) return;
    this.timer = setTimeout(() => void this.poll(), ms);
    this.timer.unref();
  }

  async poll(): Promise<void> {
    if (this.state === 'stopped' || this.polling) return;
    this.polling = true;
    try {
      await this.pollOnce();
      this.lastError = null;
    } catch (err) {
      this.lastError = (err as Error).message;
    } finally {
      this.polling = false;
      this.schedule(this.pollInterval);
    }
  }

  /** One poll step, serialised with any other poll in flight. */
  pollOnce(): Promise<void> {
    const run = this.chain.then(() => this.pollStep());
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async pollStep(): Promise<void> {
    if (this.state === 'stopped') return;
    let st;
    try {
      st = await stat(this.filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      // Renamed away and not yet recreated: drain what the old descriptor still has.
      if (this.fh) {
        await this.drainOld();
        this.rotations++;
      }
      this.state = 'waiting-for-file';
      this.idleFlush();
      return;
    }

    if (!this.fh) {
      if (!(await this.openFile('start'))) return;
    } else if (st.ino !== this.ino || st.dev !== this.dev) {
      await this.drainOld();
      this.rotations++;
      if (!(await this.openFile('start'))) return;
    } else if (st.size < this.position) {
      // copytruncate: the same file started over.
      this.truncations++;
      this.position = 0;
      this.partial = Buffer.alloc(0);
    }

    const size = (await this.fh!.stat()).size;
    if (size > this.position) {
      await this.readRange(this.fh!, this.position, Math.min(size, this.position + MAX_READ_PER_POLL));
      this.lastDataAt = Date.now();
    } else {
      this.idleFlush();
    }
  }

  private async drainOld(): Promise<void> {
    const fh = this.fh!;
    try {
      const size = (await fh.stat()).size;
      if (size > this.position) await this.readRange(fh, this.position, size);
      if (this.partial.length) {
        this.emitLine(this.partial.toString('utf-8'));
        this.partial = Buffer.alloc(0);
      }
    } finally {
      await fh.close().catch(() => undefined);
      this.fh = null;
    }
  }

  private async readRange(fh: FileHandle, from: number, to: number): Promise<void> {
    let pos = from;
    while (pos < to) {
      const len = Math.min(CHUNK, to - pos);
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      this.bytesRead += bytesRead;
      this.consume(buf.subarray(0, bytesRead));
    }
    this.position = pos;
  }

  /** Split bytes into complete lines; keep the trailing partial line. */
  private consume(chunk: Buffer): void {
    let data = this.partial.length ? Buffer.concat([this.partial, chunk]) : chunk;
    let start = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0x0a) {
        let end = i;
        if (end > start && data[end - 1] === 0x0d) end--;
        this.emitLine(data.subarray(start, end).toString('utf-8'));
        start = i + 1;
      }
    }
    data = data.subarray(start);
    if (data.length > MAX_PARTIAL_BYTES) {
      this.emitLine(data.toString('utf-8') + ' …[partial line forced]');
      data = Buffer.alloc(0);
    }
    this.partial = Buffer.from(data);
  }

  private emitLine(text: string): void {
    this.linesRead++;
    if (!this.decoder) {
      this.pendingSample.push(text);
      if (this.pendingSample.filter((l) => l.trim()).length >= 10) {
        this.setDetection(detectFormat(this.pendingSample, { format: this.requestedFormat, customPattern: this.customPattern }));
      }
      return;
    }
    this.feedLine(text);
  }

  private feedLine(text: string): void {
    this.lineNumber++;
    for (const e of this.decoder!.push({ text, lineNumber: this.lineNumber })) this.onEntry(e);
  }

  private idleFlush(): void {
    if (!this.decoder && this.pendingSample.some((l) => l.trim()) && Date.now() - this.lastDataAt >= this.pollInterval * 2) {
      this.setDetection(detectFormat(this.pendingSample, { format: this.requestedFormat, customPattern: this.customPattern }));
    }
    if (this.decoder && this.lastDataAt && Date.now() - this.lastDataAt >= this.pollInterval * 2) {
      for (const e of this.decoder.flushAssemblers()) this.onEntry(e);
    }
  }

  private onEntry(e: LogEntry): void {
    this.entriesProcessed++;
    if (this.levels?.length && !this.levels.includes(e.level)) return;
    if (this.filter) {
      this.filter.lastIndex = 0;
      if (!this.filter.test(e.message) && !this.filter.test(e.raw)) return;
    }
    this.entriesMatched++;
    this.levelCounts[e.level]++;
    const now = Date.now();
    if (isErrorLevel(e.level)) {
      this.errorTimes.push(now);
      while (this.errorTimes.length && this.errorTimes[0] < now - 60000) this.errorTimes.shift();
      if (this.errorTimes.length > 100000) this.errorTimes.shift();
    }
    this.entries.push(e);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.checkRules(e, now);
  }

  private checkRules(e: LogEntry, now: number): void {
    for (const r of this.rules) {
      if (r.levels && !r.levels.includes(e.level)) continue;
      if (r.re) {
        r.re.lastIndex = 0;
        if (!r.re.test(e.message) && !r.re.test(e.raw)) continue;
      }
      r.matchesTotal++;
      r.hits.push(now);
      while (r.hits.length && r.hits[0] < now - r.windowMs) r.hits.shift();
      if (r.hits.length > 10000) r.hits.shift();
      if (r.hits.length >= r.threshold) {
        r.fireCount++;
        r.lastFiredAt = new Date(now);
        this.alertsTriggered++;
        this.alerts.push({
          timestamp: new Date(now),
          type: r.threshold > 1 ? 'threshold' : r.re ? 'pattern' : 'level',
          rule: r.name,
          message: r.threshold > 1
            ? `${r.hits.length} matches within ${r.windowMs / 1000}s (threshold ${r.threshold})`
            : `${e.level}: ${e.message.split('\n')[0].slice(0, 200)}`,
          entry: e,
        });
        if (this.alerts.length > MAX_ALERTS) this.alerts.shift();
        // A threshold rule re-arms after firing, so it fires once per burst.
        if (r.threshold > 1) r.hits = [];
      }
    }
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.fh) {
      await this.fh.close().catch(() => undefined);
      this.fh = null;
    }
  }

  getStatus(limit = 50): Record<string, unknown> {
    const now = Date.now();
    return {
      filePath: this.filePath,
      status: this.state,
      format: this.detection?.format ?? 'pending-detection',
      ...(this.detection?.envelope ? { envelope: this.detection.envelope } : {}),
      startedAt: this.startedAt.toISOString(),
      position: this.position,
      bytesRead: this.bytesRead,
      linesRead: this.linesRead,
      rotations: this.rotations,
      truncations: this.truncations,
      entriesProcessed: this.entriesProcessed,
      entriesMatched: this.entriesMatched,
      alertsTriggered: this.alertsTriggered,
      rules: this.rules.map((r) => {
        const inWindow = r.hits.filter((t) => t >= now - r.windowMs).length;
        return {
          name: r.name,
          ...(r.re ? { pattern: r.re.source } : {}),
          ...(r.levels ? { levels: r.levels } : {}),
          threshold: r.threshold,
          windowSeconds: r.windowMs / 1000,
          matchesTotal: r.matchesTotal,
          matchesInWindow: inWindow,
          firing: r.threshold > 1 ? inWindow >= r.threshold || (r.lastFiredAt !== null && now - r.lastFiredAt.getTime() < r.windowMs) : inWindow > 0,
          fireCount: r.fireCount,
          lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
        };
      }),
      recentAlerts: this.alerts.slice(-20).map((a) => ({
        timestamp: a.timestamp.toISOString(), type: a.type, rule: a.rule, message: a.message,
        entry: serializeEntry(a.entry, { maxFrames: 5, maxMessage: 500, maxMetadataChars: 500 }),
      })),
      recentEntries: this.entries.slice(-Math.min(limit, 500)).map((e) => serializeEntry(e, { maxFrames: 5, maxMessage: 800, maxMetadataChars: 500 })),
      stats: {
        byLevel: { ...this.levelCounts },
        errorsLastMinute: this.errorTimes.filter((t) => t >= now - 60000).length,
        lastEntry: this.entries.length ? this.entries[this.entries.length - 1].timestamp?.toISOString() ?? null : null,
      },
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }
}

export async function watchLogs(o: WatchOptions): Promise<Record<string, unknown>> {
  const existing = activeWatchers.get(o.filePath);
  if (existing) {
    await existing.stop();
    activeWatchers.delete(o.filePath);
  }
  if (activeWatchers.size >= MAX_WATCHERS) {
    throw new Error(`At most ${MAX_WATCHERS} watchers can run at once; stop one first`);
  }
  const w = new LogWatcher(o);
  await w.start();
  activeWatchers.set(o.filePath, w);
  return w.getStatus();
}

export function getWatcher(filePath: string): LogWatcher | undefined {
  return activeWatchers.get(filePath);
}

export async function stopWatching(filePath: string): Promise<boolean> {
  const w = activeWatchers.get(filePath);
  if (!w) return false;
  await w.stop();
  activeWatchers.delete(filePath);
  return true;
}

export function listActiveWatchers(): Array<{ filePath: string; status: string; entriesMatched: number; alertsTriggered: number }> {
  return [...activeWatchers.values()].map((w) => ({ filePath: w.filePath, status: w.state, entriesMatched: w.entriesMatched, alertsTriggered: w.alertsTriggered }));
}

export async function stopAllWatchers(): Promise<void> {
  await Promise.all([...activeWatchers.values()].map((w) => w.stop()));
  activeWatchers.clear();
}
