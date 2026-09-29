// SPDX-License-Identifier: MIT
/**
 * Scanners write their reports to a private temp file instead of stdout:
 * it avoids `/dev/stdout` (absent on Windows), keeps progress chatter out of
 * the JSON, and lets us size-check the report before reading it.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export const MAX_REPORT_BYTES = 256 * 1024 * 1024;

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'dev-suite-secscan-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Read a report a tool wrote. Returns null when the tool wrote nothing. */
export function readReport(file: string, label: string): string | null {
  if (!existsSync(file)) return null;
  const size = statSync(file).size;
  if (size > MAX_REPORT_BYTES) {
    throw new Error(`${label} report is ${Math.round(size / 1048576)} MB, over the ${MAX_REPORT_BYTES / 1048576} MB limit; narrow the scan`);
  }
  // Some Windows tools prefix UTF-8 output with a BOM.
  return readFileSync(file, 'utf8').replace(/^﻿/, '');
}

export function parseJson<T = unknown>(text: string, label: string): T {
  try {
    return JSON.parse(text.replace(/^﻿/, '')) as T;
  } catch (err) {
    throw new Error(`${label} output is not valid JSON (${err instanceof Error ? err.message : String(err)}): ${text.slice(0, 200)}`);
  }
}

/**
 * Split a stream of concatenated JSON values (NDJSON, or pretty-printed
 * objects back to back as govulncheck emits) into parsed values.
 * Non-JSON text between values (log lines) is skipped and counted.
 */
export function parseJsonStream(text: string): { values: unknown[]; skipped: number } {
  const values: unknown[] = [];
  let skipped = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;
    const ch = text[i];
    if (ch !== '{' && ch !== '[') {
      // Skip to the next line that could start a value.
      const nl = text.indexOf('\n', i);
      const lineEnd = nl === -1 ? n : nl;
      if (text.slice(i, lineEnd).trim()) skipped++;
      i = lineEnd + 1;
      while (i < n && /\s/.test(text[i])) i++;
      continue;
    }
    let depth = 0;
    let inStr = false;
    let esc = false;
    let j = i;
    for (; j < n; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) break;
      }
    }
    const chunk = text.slice(i, j + 1);
    try {
      values.push(JSON.parse(chunk));
    } catch {
      skipped++;
    }
    i = j + 1;
    while (i < n && /\s/.test(text[i])) i++;
  }
  return { values, skipped };
}
