// SPDX-License-Identifier: MIT
/**
 * Error intelligence: fingerprint grouping, first/last seen, cause chains,
 * hourly timeline, and "new vs known" against a saved baseline, another
 * source, or a second time range of the same source.
 */

import { readFile, writeFile, access } from 'fs/promises';
import type { LogEntry, LogLevel, SourceInput } from '../types.js';
import { fingerprintEntry } from '../core/fingerprint.js';
import { causeChain } from '../core/exceptions.js';
import { scan, matchEntry, type ScanSummary, type PipelineDeps } from '../pipeline/index.js';
import { describeScan, serializeEntry, TimeSpan } from './output.js';
import { assertReadable, validateExportPath, validateLogPath } from '../utils.js';

const MAX_GROUPS = 5000;

interface GroupAcc {
  fingerprint: string;
  type: string;
  message: string;
  normalizedMessage: string;
  count: number;
  span: TimeSpan;
  frames: string[];
  causes: string[];
  sources: Set<string>;
  levels: Record<string, number>;
  examples: LogEntry[];
}

export class ErrorAccumulator {
  readonly groups = new Map<string, GroupAcc>();
  errors = 0;
  warnings = 0;
  overflowGroups = 0;
  private recent: LogEntry[] = [];
  private timeline = new Map<string, number>();

  constructor(private readonly includeWarnings: boolean, private readonly recentLimit = 20) {}

  add(e: LogEntry): void {
    const isError = e.level === 'ERROR' || e.level === 'FATAL';
    const isWarn = e.level === 'WARN';
    if (!isError && !(isWarn && this.includeWarnings)) {
      if (isWarn) this.warnings++;
      return;
    }
    if (isError) this.errors++;
    else this.warnings++;

    this.recent.push(e);
    if (this.recent.length > this.recentLimit) this.recent.shift();
    if (e.timestamp) {
      const hour = e.timestamp.toISOString().slice(0, 13) + ':00';
      this.timeline.set(hour, (this.timeline.get(hour) ?? 0) + 1);
    }

    const fp = fingerprintEntry(e);
    let g = this.groups.get(fp.fingerprint);
    if (!g) {
      if (this.groups.size >= MAX_GROUPS) { this.overflowGroups++; return; }
      g = {
        fingerprint: fp.fingerprint,
        type: fp.type,
        message: fp.message.split('\n')[0].slice(0, 500),
        normalizedMessage: fp.normalizedMessage,
        count: 0,
        span: new TimeSpan(),
        frames: e.exception?.stackTrace.slice(0, 10) ?? [],
        causes: causeChain(e.exception),
        sources: new Set(),
        levels: {},
        examples: [],
      };
      this.groups.set(fp.fingerprint, g);
    }
    g.count++;
    g.span.add(e.timestamp);
    if (e.source && g.sources.size < 20) g.sources.add(e.source);
    g.levels[e.level] = (g.levels[e.level] ?? 0) + 1;
    if (g.examples.length < 2) g.examples.push(e);
  }

  sortedGroups(): GroupAcc[] {
    return [...this.groups.values()].sort((a, b) => b.count - a.count);
  }

  recentErrors(limit: number): LogEntry[] {
    return this.recent.slice(-limit).reverse();
  }

  timelineArray(): Array<{ hour: string; count: number }> {
    return [...this.timeline.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, count }));
  }
}

export interface BaselineGroup {
  fingerprint: string;
  type: string;
  normalizedMessage: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface BaselineFile {
  kind: 'log-analyzer-error-baseline';
  version: 1;
  createdAt: string;
  sources: string[];
  groups: BaselineGroup[];
}

function toBaseline(acc: ErrorAccumulator, sources: string[]): BaselineFile {
  return {
    kind: 'log-analyzer-error-baseline',
    version: 1,
    createdAt: new Date().toISOString(),
    sources,
    groups: acc.sortedGroups().map((g) => ({
      fingerprint: g.fingerprint,
      type: g.type,
      normalizedMessage: g.normalizedMessage,
      count: g.count,
      firstSeen: g.span.start?.toISOString() ?? null,
      lastSeen: g.span.end?.toISOString() ?? null,
    })),
  };
}

async function loadBaseline(path: string): Promise<BaselineFile> {
  validateLogPath(path);
  await assertReadable(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    throw new Error(`baselineFile ${path} is not valid JSON: ${(err as Error).message}`);
  }
  const b = parsed as BaselineFile;
  if (b?.kind !== 'log-analyzer-error-baseline' || !Array.isArray(b.groups)) {
    throw new Error(`baselineFile ${path} is not a log-analyzer error baseline (create one with saveBaselineTo)`);
  }
  return b;
}

export interface FindErrorsOptions {
  startTime?: Date;
  endTime?: Date;
  includeWarnings?: boolean;
  limit?: number;
  groupLimit?: number;
  groupByException?: boolean;
  baselineFile?: string;
  baselinePaths?: string[];
  baselineStartTime?: Date;
  baselineEndTime?: Date;
  saveBaselineTo?: string;
  overwrite?: boolean;
}

export async function findErrors(input: SourceInput, o: FindErrorsOptions, deps: PipelineDeps = {}): Promise<Record<string, unknown>> {
  const includeWarnings = o.includeWarnings ?? false;
  // WARN is always scanned so totalWarnings is a real count; it is grouped only when includeWarnings.
  const levels: LogLevel[] = ['WARN', 'ERROR', 'FATAL'];
  const current = new ErrorAccumulator(includeWarnings, o.limit ?? 20);
  let baselineAcc: ErrorAccumulator | null = null;
  let baselineSummary: ScanSummary | null = null;
  let summary: ScanSummary;

  const sameSourceBaseline = o.baselineStartTime !== undefined || o.baselineEndTime !== undefined;
  if (sameSourceBaseline) {
    // One pass: route each entry into the current or the baseline window.
    baselineAcc = new ErrorAccumulator(includeWarnings);
    const curCounters = { excludedNoTimestamp: 0 };
    const baseCounters = { excludedNoTimestamp: 0 };
    let matchedCurrent = 0;
    summary = await scan(input, { filter: { levels } }, (e) => {
      if (matchEntry(e, { startTime: o.startTime, endTime: o.endTime }, curCounters)) { current.add(e); matchedCurrent++; }
      if (matchEntry(e, { startTime: o.baselineStartTime, endTime: o.baselineEndTime }, baseCounters)) baselineAcc!.add(e);
    }, deps);
    summary.entriesMatched = matchedCurrent;
    summary.excludedNoTimestamp = curCounters.excludedNoTimestamp;
  } else {
    summary = await scan(input, { filter: { levels, startTime: o.startTime, endTime: o.endTime } }, (e) => current.add(e), deps);
    if (o.baselinePaths?.length) {
      baselineAcc = new ErrorAccumulator(includeWarnings);
      baselineSummary = await scan({ paths: o.baselinePaths, format: input.format, customPattern: input.customPattern }, { filter: { levels } }, (e) => baselineAcc!.add(e), deps);
    }
  }

  let baselineFps: Map<string, BaselineGroup> | null = null;
  let baselineLabel: string | undefined;
  if (o.baselineFile) {
    const b = await loadBaseline(o.baselineFile);
    baselineFps = new Map(b.groups.map((g) => [g.fingerprint, g]));
    baselineLabel = `file ${o.baselineFile} (created ${b.createdAt})`;
  } else if (baselineAcc) {
    baselineFps = new Map(toBaseline(baselineAcc, []).groups.map((g) => [g.fingerprint, g]));
    baselineLabel = sameSourceBaseline
      ? `time range ${o.baselineStartTime?.toISOString() ?? '-∞'} .. ${o.baselineEndTime?.toISOString() ?? '+∞'}`
      : `sources ${o.baselinePaths!.join(', ')}`;
  }

  const groupLimit = Math.min(o.groupLimit ?? 50, 500);
  const groups = current.sortedGroups();
  const groupOut = (o.groupByException ?? true)
    ? groups.slice(0, groupLimit).map((g) => ({
      fingerprint: g.fingerprint,
      exceptionType: g.type,
      message: g.message,
      normalizedMessage: g.normalizedMessage,
      count: g.count,
      firstOccurrence: g.span.start?.toISOString() ?? null,
      lastOccurrence: g.span.end?.toISOString() ?? null,
      ...(g.causes.length ? { causedBy: g.causes } : {}),
      stackTrace: g.frames,
      sources: [...g.sources],
      levels: g.levels,
      ...(baselineFps ? { status: baselineFps.has(g.fingerprint) ? 'known' : 'new' } : {}),
      example: g.examples[0] ? serializeEntry(g.examples[0], { maxFrames: 10, maxMessage: 1000 }) : undefined,
    }))
    : [];

  const result: Record<string, unknown> = {
    totalErrors: current.errors,
    totalWarnings: current.warnings,
    distinctFingerprints: current.groups.size,
    errorGroups: groupOut,
    ...(groups.length > groupLimit ? { groupsTruncated: true, groupsOmitted: groups.length - groupLimit } : {}),
    ...(current.overflowGroups ? { entriesBeyondGroupLimit: current.overflowGroups } : {}),
    recentErrors: current.recentErrors(o.limit ?? 20).map((e) => serializeEntry(e, { maxFrames: 8, maxMessage: 800 })),
    errorTimeline: current.timelineArray(),
    scan: describeScan(summary),
  };

  if (baselineFps) {
    const seen = new Set(current.groups.keys());
    const newGroups = groups.filter((g) => !baselineFps!.has(g.fingerprint));
    const resolved = [...baselineFps.values()].filter((b) => !seen.has(b.fingerprint));
    result.baseline = {
      comparedWith: baselineLabel,
      newFingerprints: newGroups.length,
      knownFingerprints: groups.length - newGroups.length,
      resolvedFingerprints: resolved.length,
      newErrors: newGroups.slice(0, 50).map((g) => ({ fingerprint: g.fingerprint, type: g.type, message: g.message, count: g.count, firstOccurrence: g.span.start?.toISOString() ?? null })),
      resolved: resolved.slice(0, 50),
      ...(baselineSummary ? { baselineScan: describeScan(baselineSummary) } : {}),
    };
  }

  if (o.saveBaselineTo) {
    validateExportPath(o.saveBaselineTo);
    const exists = await access(o.saveBaselineTo).then(() => true, () => false);
    if (exists && !o.overwrite) {
      throw new Error(`${o.saveBaselineTo} already exists; pass overwrite: true to replace it`);
    }
    const baseline = toBaseline(current, summary.sources.map((s) => s.source));
    await writeFile(o.saveBaselineTo, JSON.stringify(baseline, null, 2), 'utf-8');
    result.savedBaseline = { path: o.saveBaselineTo, fingerprints: baseline.groups.length, overwritten: exists };
  }
  return result;
}
