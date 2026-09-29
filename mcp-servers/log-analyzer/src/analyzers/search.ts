// SPDX-License-Identifier: MIT
/**
 * search_logs: grep-like search over files, directories, globs, gzip and live
 * sources, streaming with a bounded context window (the old version loaded
 * every file fully into memory to provide context).
 */

import type { SourceInput } from '../types.js';
import { openSources, detectHandle, type PipelineDeps } from '../pipeline/index.js';
import { createParser } from '../parsers/index.js';
import { safeRegex } from '../utils.js';

export interface SearchMatch {
  file: string;
  lineNumber: number;
  line: string;
  matchStart: number;
  matchEnd: number;
  contextBefore: string[];
  contextAfter: string[];
  level?: string;
  timestamp?: string | null;
}

const MAX_LINE_OUT = 2000;
const clip = (s: string) => (s.length > MAX_LINE_OUT ? s.slice(0, MAX_LINE_OUT) + ' …' : s);

export async function searchLogs(
  input: SourceInput,
  o: { query: string; caseSensitive?: boolean; useRegex?: boolean; context?: number; limit?: number; invert?: boolean },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const flags = o.caseSensitive ? '' : 'i';
  const pattern = o.useRegex ? safeRegex(o.query, flags) : new RegExp(o.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  const ctx = Math.min(Math.max(0, o.context ?? 0), 20);
  const limit = Math.min(o.limit ?? 100, 1000);

  const opened = await openSources(input, deps);
  const matches: SearchMatch[] = [];
  let totalMatches = 0;
  const filesWithMatches = new Set<string>();
  const perSource: Array<{ source: string; lines: number; matches: number }> = [];

  for (const handle of opened.handles) {
    const detection = await detectHandle(handle, { format: input.format, customPattern: input.customPattern });
    let parser: ReturnType<typeof createParser> | null = null;
    try {
      if (!detection.envelope) parser = createParser(detection.format, { customPattern: input.customPattern, plainMode: detection.plainMode });
    } catch { parser = null; }

    const before: string[] = [];
    const waitingAfter: SearchMatch[] = [];
    let lines = 0;
    let found = 0;
    for await (const raw of handle.lines()) {
      lines++;
      for (let i = waitingAfter.length - 1; i >= 0; i--) {
        const m = waitingAfter[i];
        m.contextAfter.push(clip(raw.text));
        if (m.contextAfter.length >= ctx) waitingAfter.splice(i, 1);
      }
      const m = pattern.exec(raw.text);
      const hit = o.invert ? !m : !!m;
      if (hit) {
        totalMatches++;
        found++;
        filesWithMatches.add(handle.label);
        if (matches.length < limit) {
          const entry = parser?.parseLine(raw.text, raw.lineNumber) ?? null;
          const match: SearchMatch = {
            file: handle.label,
            lineNumber: raw.lineNumber,
            line: clip(raw.text),
            matchStart: m ? m.index : 0,
            matchEnd: m ? m.index + m[0].length : 0,
            contextBefore: [...before],
            contextAfter: [],
            ...(entry ? { level: entry.level, timestamp: entry.timestamp?.toISOString() ?? null } : {}),
          };
          matches.push(match);
          if (ctx > 0) waitingAfter.push(match);
        }
      }
      if (ctx > 0) {
        before.push(clip(raw.text));
        if (before.length > ctx) before.shift();
      }
      // Stop reading once the page is full and all context is filled — unless
      // an exact total is needed, which requires reading on (bounded by the source).
      if (matches.length >= limit && waitingAfter.length === 0 && totalMatches > limit * 20) break;
    }
    perSource.push({ source: handle.label, lines, matches: found });
  }

  return {
    query: o.query,
    totalMatches,
    ...(totalMatches > limit * 20 ? { totalIsLowerBound: true } : {}),
    returned: matches.length,
    ...(totalMatches > matches.length ? { truncated: true } : {}),
    filesSearched: opened.handles.length,
    filesWithMatches: filesWithMatches.size,
    matches,
    sources: perSource,
    ...(opened.skipped.length ? { skipped: opened.skipped } : {}),
    ...(opened.filesTruncated ? { filesTruncated: true } : {}),
    searchTimeMs: Date.now() - t0,
  };
}
