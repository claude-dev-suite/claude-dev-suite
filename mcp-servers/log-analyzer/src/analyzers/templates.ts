// SPDX-License-Identifier: MIT
/**
 * mine_templates: cluster messages into templates with Drain, streaming.
 */

import type { LogLevel, SourceInput } from '../types.js';
import { Drain, templateText } from '../core/drain.js';
import { emptyLevelCounts } from '../core/levels.js';
import { scan, type PipelineDeps } from '../pipeline/index.js';
import { describeScan, TimeSpan } from './output.js';

interface ClusterStats {
  levels: Record<LogLevel, number>;
  span: TimeSpan;
  example: string;
  sources: Set<string>;
}

export async function mineTemplates(
  input: SourceInput,
  o: {
    startTime?: Date; endTime?: Date; levels?: LogLevel[]; filter?: RegExp;
    similarity?: number; depth?: number; limit?: number; maxClusters?: number; minCount?: number;
  },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const drain = new Drain({ simThreshold: o.similarity ?? 0.4, depth: o.depth ?? 4, maxClusters: o.maxClusters ?? 5000 });
  const extra = new Map<number, ClusterStats>();
  let messages = 0;

  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime, levels: o.levels, filter: o.filter } }, (e) => {
    const firstLine = e.message.split('\n')[0];
    if (!firstLine.trim()) return;
    messages++;
    const c = drain.add(firstLine.slice(0, 2000));
    if (!c) return;
    let s = extra.get(c.id);
    if (!s) {
      s = { levels: emptyLevelCounts(), span: new TimeSpan(), example: firstLine.slice(0, 400), sources: new Set() };
      extra.set(c.id, s);
    }
    s.levels[e.level]++;
    s.span.add(e.timestamp);
    if (e.source && s.sources.size < 10) s.sources.add(e.source);
  }, deps);

  const limit = Math.min(o.limit ?? 50, 500);
  const minCount = o.minCount ?? 1;
  const all = drain.clusters.filter((c) => c.size >= minCount).sort((a, b) => b.size - a.size);
  const templates = all.slice(0, limit).map((c) => {
    const s = extra.get(c.id)!;
    const levels = Object.fromEntries(Object.entries(s.levels).filter(([, n]) => n > 0));
    return {
      template: templateText(c),
      count: c.size,
      share: messages ? Math.round((c.size / messages) * 10000) / 100 : 0,
      levels,
      firstSeen: s.span.start?.toISOString() ?? null,
      lastSeen: s.span.end?.toISOString() ?? null,
      example: s.example,
      sources: [...s.sources],
    };
  });

  return {
    messages,
    templatesFound: drain.clusters.length,
    templates,
    ...(all.length > limit ? { truncated: true, templatesOmitted: all.length - limit } : {}),
    ...(drain.unclustered ? { unclusteredMessages: drain.unclustered, note: 'maxClusters reached; later novel messages were not clustered' } : {}),
    parameters: { similarity: o.similarity ?? 0.4, depth: o.depth ?? 4 },
    scan: describeScan(summary),
  };
}
