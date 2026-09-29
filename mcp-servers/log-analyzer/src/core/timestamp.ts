// SPDX-License-Identifier: MIT
/**
 * Timestamp parsing shared by every parser.
 *
 * The contract is deliberately strict: anything that cannot be read as a real
 * point in time returns `null`. The previous implementation fell back to
 * `new Date()`, which silently stamped unparseable lines with the moment of
 * analysis — they then passed (or failed) time filters by accident and
 * polluted every timeline.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function valid(d: Date): Date | null {
  const t = d.getTime();
  // Reject NaN and absurd years (a stray number read as epoch seconds, etc.)
  if (Number.isNaN(t)) return null;
  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2200) return null;
  return d;
}

function tzOffsetMinutes(tz: string | undefined): number | null {
  if (!tz) return null;
  if (tz === 'Z' || tz === 'z' || tz === 'UTC' || tz === 'GMT') return 0;
  const m = tz.match(/^([+-])(\d{2}):?(\d{2})?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? '0', 10));
}

/**
 * Build a date from components. With a zone offset the result is exact;
 * without one the components are read as local time (the same choice every
 * mainstream log viewer makes for zone-less timestamps).
 */
function fromParts(
  year: number, month: number, day: number,
  hour: number, min: number, sec: number,
  fraction: string | undefined, tz: string | undefined,
): Date | null {
  const ms = fraction ? Math.round(parseFloat('0.' + fraction) * 1000) : 0;
  const offset = tzOffsetMinutes(tz);
  if (offset !== null) {
    const utc = Date.UTC(year, month, day, hour, min, sec, ms) - offset * 60000;
    return valid(new Date(utc));
  }
  return valid(new Date(year, month, day, hour, min, sec, ms));
}

/** Epoch number in s / ms / µs / ns → Date. */
export function fromEpoch(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  let ms: number;
  if (value > 1e17) ms = value / 1e6;        // ns
  else if (value > 1e14) ms = value / 1e3;   // µs
  else if (value > 1e11) ms = value;         // ms
  else ms = value * 1000;                    // s (possibly fractional)
  return valid(new Date(ms));
}

/**
 * Parse a timestamp in any common log notation. Returns null on failure.
 * `yearHint` is used for formats that omit the year (syslog, klog).
 */
export function parseTimestamp(input: unknown): Date | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) return valid(input);
  if (typeof input === 'number') return fromEpoch(input);
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  // Pure numeric → epoch
  if (/^\d{9,19}(\.\d+)?$/.test(s)) return fromEpoch(parseFloat(s));

  // ISO-8601 / RFC3339 and the "space instead of T", "comma millis" variants:
  // 2024-12-13T10:30:45.123456789Z, 2024-12-13 10:30:45,123, 2024-12-13T10:30:45+0100
  let m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,](\d+))?\s*(Z|z|[+-]\d{2}:?\d{2}|UTC|GMT)?$/,
  );
  if (m) {
    return fromParts(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0), m[7], m[8]);
  }

  // Date only
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return fromParts(+m[1], +m[2] - 1, +m[3], 0, 0, 0, undefined, undefined);

  // 2024/12/13 10:30:45(.123) — nginx error log, Go stdlib log
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) return fromParts(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7], m[8]);

  // CLF: 10/Oct/2000:13:55:36 -0700  (also with a space instead of the colon)
  m = s.match(/^(\d{1,2})\/(\w{3})\/(\d{4})[: ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?\s*([+-]\d{4})?$/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    return fromParts(+m[3], MONTHS[m[2].toLowerCase()], +m[1], +m[4], +m[5], +m[6], m[7], m[8]);
  }

  // Apache error log / ctime: Sun Dec 10 10:30:45.123456 2024
  m = s.match(/^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) {
    return fromParts(+m[7], MONTHS[m[1].toLowerCase()], +m[2], +m[3], +m[4], +m[5], m[6], undefined);
  }

  // Django dev server: 13/Dec/2024 10:30:45 (handled by CLF branch above)

  // RFC 2822 and anything else Date understands unambiguously (has a zone or a month name)
  if (/[A-Za-z]{3}/.test(s) && /\d{4}/.test(s)) {
    const d = new Date(s);
    return valid(d);
  }

  return null;
}

/**
 * Parse a year-less "Mon DD HH:MM:SS" (syslog RFC3164) or "MMDD HH:MM:SS.ffffff"
 * (klog). The year is inferred as the most recent year that does not put the
 * timestamp in the future — callers flag the entry `timestampYearInferred`.
 */
export function parseYearless(month: number, day: number, hms: string, now = new Date()): Date | null {
  const m = hms.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m || month < 0 || month > 11) return null;
  let d = fromParts(now.getFullYear(), month, day, +m[1], +m[2], +m[3], m[4], undefined);
  if (d && d.getTime() > now.getTime() + 24 * 3600 * 1000) {
    d = fromParts(now.getFullYear() - 1, month, day, +m[1], +m[2], +m[3], m[4], undefined);
  }
  return d;
}

export function monthIndex(name: string): number {
  return MONTHS[name.toLowerCase()] ?? -1;
}

/** A regex fragment that recognises the start-of-line timestamps above. */
export const LEADING_TIMESTAMP_RE =
  /^\[?(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{4}\/\d{2}\/\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\d{1,2}\/\w{3}\/\d{4}[: ]\d{2}:\d{2}:\d{2}(?:\s[+-]\d{4})?|\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}|\d{10}(?:\.\d+)?)\]?/;

/** Duration literal → milliseconds ("250ms", "1.5s", "3m", "120us", "42"). */
export function parseDurationMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(ns|us|µs|ms|s|m|min|h)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch ((m[2] ?? '').toLowerCase()) {
    case 'ns': return n / 1e6;
    case 'us': case 'µs': return n / 1e3;
    case 'ms': case '': return n;
    case 's': return n * 1000;
    case 'm': case 'min': return n * 60000;
    case 'h': return n * 3600000;
    default: return null;
  }
}

/** Parse a user-supplied window like "5m", "1h", "30s", "1d" into ms. */
export function parseWindow(value: string): number {
  const m = value.trim().match(/^(\d+)\s*(s|m|h|d)$/);
  if (!m) throw new Error(`Invalid time window "${value}" (use e.g. 30s, 5m, 1h, 1d)`);
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  if (n <= 0) throw new Error(`Time window must be positive: "${value}"`);
  return n * unit;
}

/** Parse a user-supplied time bound: ISO timestamp, epoch, or relative ("15m" = 15 minutes ago). */
export function parseTimeBound(value: string | undefined, now = Date.now()): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (/^\d+\s*[smhd]$/.test(value.trim())) return new Date(now - parseWindow(value));
  const d = parseTimestamp(value);
  if (!d) throw new Error(`Invalid time "${value}": use ISO-8601, epoch, or a relative window like 15m`);
  return d;
}
