// SPDX-License-Identifier: MIT
/**
 * Streaming statistics: counts by level / logger / time bucket, error rate,
 * peak and quiet periods. Entries without a timestamp are counted in totals
 * and reported separately — they never land in a made-up bucket.
 */

import type { LogEntry, LogLevel, LogStats, SourceInput } from '../types.js';
import { emptyLevelCounts, isErrorLevel } from '../core/levels.js';
import { scan, type PipelineDeps } from '../pipeline/index.js';
import { describeScan, TimeSpan } from './output.js';

const MAX_LOGGERS = 2000;
const MAX_BUCKETS = 20000;

export type GroupBy = 'minute' | 'hour' | 'day';

function timeKey(d: Date, g: GroupBy): string {
  const iso = d.toISOString();
  return g === 'minute' ? iso.slice(0, 16) : g === 'hour' ? iso.slice(0, 13) + ':00' : iso.slice(0, 10);
}

export class StatsAccumulator {
  total = 0;
  noTimestamp = 0;
  readonly byLevel: Record<LogLevel, number> = emptyLevelCounts();
  private loggers = new Map<string, { total: number; errors: number }>();
  private loggerOverflow = 0;
  private buckets = new Map<string, { total: number; errors: number; warnings: number }>();
  readonly span = new TimeSpan();

  constructor(private readonly groupBy: GroupBy = 'hour') {}

  add(e: LogEntry): void {
    this.total++;
    this.byLevel[e.level]++;
    const err = isErrorLevel(e.level);
    const name = e.logger || '(none)';
    const l = this.loggers.get(name);
    if (l) { l.total++; if (err) l.errors++; }
    else if (this.loggers.size < MAX_LOGGERS) this.loggers.set(name, { total: 1, errors: err ? 1 : 0 });
    else this.loggerOverflow++;

    if (!e.timestamp) { this.noTimestamp++; return; }
    this.span.add(e.timestamp);
    const k = timeKey(e.timestamp, this.groupBy);
    let b = this.buckets.get(k);
    if (!b) {
      if (this.buckets.size >= MAX_BUCKETS) return;
      b = { total: 0, errors: 0, warnings: 0 };
      this.buckets.set(k, b);
    }
    b.total++;
    if (err) b.errors++;
    if (e.level === 'WARN') b.warnings++;
  }

  result(): { stats: LogStats; timeRange: Record<string, unknown>; loggersTruncated?: number; bucketsTruncated?: boolean } {
    const byHour = [...this.buckets.entries()].map(([hour, v]) => ({ hour, ...v })).sort((a, b) => a.hour.localeCompare(b.hour));
    const topLoggers = [...this.loggers.entries()]
      .map(([logger, v]) => ({ logger, count: v.total, errorCount: v.errors }))
      .sort((a, b) => b.count - a.count);
    const byLogger: Record<string, number> = {};
    for (const t of topLoggers.slice(0, 100)) byLogger[t.logger] = t.count;
    let peak = byHour[0];
    let quiet = byHour[0];
    for (const b of byHour) {
      if (b.total > peak.total) peak = b;
      if (b.total < quiet.total) quiet = b;
    }
    const durationMinutes = this.span.start && this.span.end ? (this.span.end.getTime() - this.span.start.getTime()) / 60000 : 0;
    const errors = this.byLevel.ERROR + this.byLevel.FATAL;
    return {
      stats: {
        totalEntries: this.total,
        byLevel: { ...this.byLevel },
        byLogger,
        byHour: byHour.slice(-500),
        topLoggers: topLoggers.slice(0, 20),
        errorRate: this.total ? Math.round((errors / this.total) * 1000 * 100) / 100 : 0,
        avgEntriesPerMinute: durationMinutes > 0 ? Math.round(((this.total - this.noTimestamp) / durationMinutes) * 100) / 100 : 0,
        peakHour: peak?.hour ?? '',
        quietestHour: quiet?.hour ?? '',
        entriesWithoutTimestamp: this.noTimestamp,
      },
      timeRange: { ...this.span.toJSON(), durationMinutes: Math.round(durationMinutes) },
      ...(this.loggerOverflow ? { loggersTruncated: this.loggerOverflow } : {}),
      ...(byHour.length > 500 ? { bucketsTruncated: true } : {}),
    };
  }
}

export async function aggregateStats(
  input: SourceInput,
  o: { groupBy?: GroupBy; startTime?: Date; endTime?: Date },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const acc = new StatsAccumulator(o.groupBy ?? 'hour');
  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => acc.add(e), deps);
  const r = acc.result();
  return {
    groupBy: o.groupBy ?? 'hour',
    timeRange: r.timeRange,
    stats: r.stats,
    ...(r.bucketsTruncated ? { bucketsTruncated: true, note: 'only the latest 500 buckets are listed; use a coarser groupBy' } : {}),
    ...(r.loggersTruncated ? { entriesFromUntrackedLoggers: r.loggersTruncated } : {}),
    scan: describeScan(summary),
  };
}
