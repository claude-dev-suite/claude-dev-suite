// SPDX-License-Identifier: MIT
/**
 * Parsers for docker CLI output.
 */

import { DockerError } from "./exec.js";
import { scrubUrlCredentials } from "./redact.js";

/**
 * Parse `--format '{{json .}}'` / `--format json` output.
 *
 * Handles newline-delimited objects (docker, compose v2.21+) and a single JSON
 * array (older compose `ps --format json`). A line that fails to parse is an
 * error, not a silently dropped row.
 */
export function parseJsonLines<T = Record<string, unknown>>(stdout: string): T[] {
  const text = stdout.trim();
  if (text === "") return [];
  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr as T[];
    } catch {
      /* fall through to line mode */
    }
  }
  const rows: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    try {
      const v = JSON.parse(l);
      if (Array.isArray(v)) rows.push(...(v as T[]));
      else rows.push(v as T);
    } catch {
      throw new DockerError("PARSE_ERROR", `Could not parse docker JSON output line: ${l.slice(0, 200)}`);
    }
  }
  return rows;
}

export function parseJson<T = unknown>(stdout: string, what = "docker output"): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new DockerError("PARSE_ERROR", `Could not parse ${what} as JSON: ${stdout.slice(0, 200)}`);
  }
}

/** Apply a limit to a list and report truncation. */
export function limitList<T>(items: T[], limit: number): { items: T[]; total: number; truncated: boolean } {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
}

/** Docker size strings ("1.2GB", "512kB", "0B") to bytes. Decimal units, as docker prints them. */
export function parseSize(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /^\s*([\d.]+)\s*([kKMGTP]?i?B)?\s*$/.exec(s);
  if (!m) return undefined;
  const n = Number.parseFloat(m[1]);
  const unit = (m[2] ?? "B").toUpperCase();
  const mult: Record<string, number> = {
    B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15,
    KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
  };
  return Math.round(n * (mult[unit] ?? 1));
}

/** "Total reclaimed space: 1.2GB" → "1.2GB". */
export function parseReclaimed(stdout: string): string | undefined {
  const m = /Total reclaimed space:\s*(\S+)/i.exec(stdout);
  return m?.[1];
}

/**
 * Parse docker's CreatedAt ("2024-01-02 03:04:05 +0000 UTC") into epoch ms.
 * Returns undefined when unparseable.
 */
export function parseDockerTime(s: unknown): number | undefined {
  if (typeof s !== "string" || !s) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2}):?(\d{2})?/.exec(s);
  if (m) {
    const t = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`);
    return Number.isNaN(t) ? undefined : t;
  }
  // RFC3339 with nanoseconds ("…05.123456789Z"): keep milliseconds only.
  const t = Date.parse(s.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? undefined : t;
}

/**
 * Docker's `until` filter: a Unix timestamp, an RFC3339 date, or a Go duration
 * relative to now ("24h", "90m"). Returns the cutoff in epoch ms.
 */
export function parseUntil(until: string, now = Date.now()): number {
  const s = until.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number.parseFloat(s) * 1000);
  const dur = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (dur && (dur[1] || dur[2] || dur[3])) {
    const ms = (Number(dur[1] ?? 0) * 3600 + Number(dur[2] ?? 0) * 60 + Number(dur[3] ?? 0)) * 1000;
    return now - ms;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  throw new DockerError("INVALID_ARGUMENT", `Unsupported 'until' value '${until}': use a duration like 24h, a Unix timestamp or an RFC3339 date`);
}

/** Split text into lines, optionally keeping only those containing `grep`. */
export function filterLines(text: string, grep?: string, ignoreCase = false): { text: string; matched?: number } {
  if (!grep) return { text };
  const needle = ignoreCase ? grep.toLowerCase() : grep;
  const lines = text.split(/\r?\n/).filter((l) => (ignoreCase ? l.toLowerCase() : l).includes(needle));
  return { text: lines.join("\n"), matched: lines.length };
}

/** `docker top` / `compose top` tabular output → rows keyed by header. The last column takes the remainder. */
export function parseTable(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const headers = lines[0].trim().split(/\s+/);
  return lines.slice(1).map((line) => {
    const parts = line.trim().split(/\s+/);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = i === headers.length - 1 ? parts.slice(i).join(" ") : (parts[i] ?? "");
    });
    return row;
  });
}

/** Scrub URL credentials from every string value in a row (e.g. a container's Command). */
export function scrubRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[k] = typeof v === "string" ? scrubUrlCredentials(v) : v;
  }
  return out as T;
}
