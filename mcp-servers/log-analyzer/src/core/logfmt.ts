// SPDX-License-Identifier: MIT
/**
 * logfmt / generic key=value tokenizer.
 *
 * Handles the variants seen in the wild: logfmt (Heroku router, Go slog text,
 * logrus TextFormatter), quoted values with escapes, bare keys (ignored), and a leading free-text prefix before the first
 * pair. Keys may contain dots, dashes and slashes (`http.status`, `x-request-id`).
 */

export interface LogfmtResult {
  pairs: Record<string, string>;
  /** Number of key=value pairs actually found (bare keys excluded). */
  count: number;
  /** Text before the first pair, if any. */
  prefix: string;
}

const KEY_CHAR = /[A-Za-z0-9_.\-\/@]/;

export function parseLogfmt(line: string, maxPairs = 200): LogfmtResult {
  const pairs: Record<string, string> = {};
  let count = 0;
  let i = 0;
  const n = line.length;
  let prefixEnd = -1;

  while (i < n && count < maxPairs) {
    while (i < n && line[i] === ' ') i++;
    if (i >= n) break;
    const keyStart = i;
    while (i < n && KEY_CHAR.test(line[i])) i++;
    const key = line.slice(keyStart, i);
    if (key && line[i] === '=') {
      i++; // skip '='
      let value = '';
      if (line[i] === '"') {
        i++;
        let buf = '';
        while (i < n && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < n) {
            const next = line[i + 1];
            buf += next === 'n' ? '\n' : next === 't' ? '\t' : next;
            i += 2;
          } else {
            buf += line[i++];
          }
        }
        i++; // closing quote
        value = buf;
      } else {
        const vs = i;
        while (i < n && line[i] !== ' ') i++;
        value = line.slice(vs, i);
      }
      if (prefixEnd < 0) prefixEnd = keyStart;
      pairs[key] = value;
      count++;
    } else {
      // Not a pair: skip the token (free text before the first pair is the prefix).
      while (i < n && line[i] !== ' ') i++;
    }
  }
  const prefix = prefixEnd > 0 ? line.slice(0, prefixEnd).trim() : prefixEnd === 0 ? '' : line.trim();
  return { pairs, count, prefix };
}

/** True when the line is predominantly key=value pairs. */
export function looksLikeLogfmt(line: string): boolean {
  if (line.startsWith('{') || line.length < 5) return false;
  const r = parseLogfmt(line, 50);
  if (r.count < 2) return false;
  return r.prefix.length === 0 || r.count >= 3;
}
