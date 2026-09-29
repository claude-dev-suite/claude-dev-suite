// SPDX-License-Identifier: MIT
/**
 * query_logs: structured filtering and aggregation over any source, streaming.
 *
 * LogQL-lite syntax (the `query` string):
 *
 *   <filters> [| <stage>]...
 *
 *   filters   terms joined by `and` (or `,`):
 *               "text"            raw line contains text (case-insensitive)
 *               !"text"           raw line does not contain text
 *               field = value     also != > >= < <=  (numbers, durations "250ms", levels, ISO times)
 *               field =~ "regex"  also !~            (prefix the regex with (?i) for case-insensitive)
 *               field contains "x" / field !contains "x"
 *               field in (a, b, c)
 *               exists(field) / !exists(field)
 *   stages    count [by (f1, f2)]
 *             count_over_time(5m) [by (f)]
 *             sum(field) | avg(field) | min(field) | max(field) | count_distinct(field)   [by (...)]
 *             percentiles(field[, 50, 95, 99]) [by (...)]
 *             top N          keep the N largest groups
 *             limit N        entries mode: return at most N entries
 *             newest         entries mode: return the newest N instead of the oldest
 *             where <filters> additional filters
 *
 *   Examples
 *     level >= ERROR and service = "api" | count by (logger) | top 10
 *     status >= 500 | count_over_time(1m)
 *     "timeout" and path =~ "^/api/" | percentiles(durationMs, 50, 95, 99) by (path) | top 5
 *
 * Fields: see core/fields.ts (level, message, raw, logger, source, traceId,
 * requestId, exception.type, … and any parsed field, dotted paths allowed).
 */

import type { LogEntry, SourceInput } from '../types.js';
import { fieldKey, getField, toNumber } from '../core/fields.js';
import { levelRank, toLevel } from '../core/levels.js';
import { Reservoir, round } from '../core/quantile.js';
import { parseTimestamp, parseWindow } from '../core/timestamp.js';
import { scan, type PipelineDeps } from '../pipeline/index.js';
import { safeRegex } from '../utils.js';
import { bucketKey, describeScan, serializeEntry } from './output.js';

export type Op = '=' | '!=' | '=~' | '!~' | '>' | '>=' | '<' | '<=' | 'contains' | '!contains' | 'exists' | '!exists' | 'in';

export interface Condition {
  field: string;
  op: Op;
  value?: string | number | boolean | Array<string | number>;
}

export interface Aggregate {
  op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percentiles' | 'count_distinct';
  field?: string;
  percentiles?: number[];
}

export interface QuerySpec {
  where?: Condition[];
  text?: string[];
  notText?: string[];
  groupBy?: string[];
  aggregate?: Aggregate;
  bucket?: string;
  topK?: number;
  limit?: number;
  newest?: boolean;
}

// ---------------------------------------------------------------- tokenizer

type Tok = { t: 'str' | 'word' | 'op' | 'punct'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && c !== '`' && j + 1 < src.length) {
          const n = src[j + 1];
          // keep regex escapes intact; only unescape the quote and backslash-quote
          s += n === c ? c : '\\' + n;
          j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new Error(`Unterminated string starting at position ${i}`);
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '!=', '=~', '!~', '=='].includes(two)) { out.push({ t: 'op', v: two === '==' ? '=' : two }); i += 2; continue; }
    if ('=<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if ('|(),!'.includes(c)) { out.push({ t: 'punct', v: c }); i++; continue; }
    const m = src.slice(i).match(/^[A-Za-z0-9_.@\-\/:$*+]+/);
    if (!m) throw new Error(`Unexpected character "${c}" at position ${i}`);
    out.push({ t: 'word', v: m[0] });
    i += m[0].length;
  }
  return out;
}

// ---------------------------------------------------------------- parser

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}
  peek(o = 0): Tok | undefined { return this.toks[this.i + o]; }
  next(): Tok { const t = this.toks[this.i++]; if (!t) throw new Error('Unexpected end of query'); return t; }
  done(): boolean { return this.i >= this.toks.length; }
  expect(v: string): void { const t = this.next(); if (t.v !== v) throw new Error(`Expected "${v}" but found "${t.v}"`); }
  isWord(v: string): boolean { const t = this.peek(); return !!t && t.t === 'word' && t.v.toLowerCase() === v; }

  parse(): QuerySpec {
    const spec: QuerySpec = { where: [], text: [], notText: [] };
    if (!this.done() && this.peek()!.v !== '|') this.filters(spec);
    while (!this.done()) {
      this.expect('|');
      this.stage(spec);
    }
    return spec;
  }

  private filters(spec: QuerySpec): void {
    this.term(spec);
    while (!this.done() && (this.isWord('and') || this.peek()!.v === ',')) {
      this.next();
      this.term(spec);
    }
    if (!this.done() && this.peek()!.v !== '|') {
      throw new Error(`Unexpected "${this.peek()!.v}" — join filters with "and"; "or" is not supported (use =~ "a|b")`);
    }
  }

  private term(spec: QuerySpec): void {
    const t = this.next();
    if (t.t === 'str') { spec.text!.push(t.v); return; }
    if (t.v === '!') {
      const n = this.next();
      if (n.t === 'str') { spec.notText!.push(n.v); return; }
      if (n.t === 'word' && n.v.toLowerCase() === 'exists') { spec.where!.push({ field: this.parenField(), op: '!exists' }); return; }
      throw new Error(`Unexpected "${n.v}" after "!"`);
    }
    if (t.t !== 'word') throw new Error(`Expected a field name, found "${t.v}"`);
    if (t.v.toLowerCase() === 'exists' && this.peek()?.v === '(') { spec.where!.push({ field: this.parenField(), op: 'exists' }); return; }
    const field = t.v;
    const opTok = this.next();
    let op: Op;
    if (opTok.t === 'op') op = opTok.v as Op;
    else if (opTok.t === 'word' && ['contains', 'in'].includes(opTok.v.toLowerCase())) op = opTok.v.toLowerCase() as Op;
    else if (opTok.v === '!' && this.isWord('contains')) { this.next(); op = '!contains'; }
    else throw new Error(`Expected an operator after "${field}", found "${opTok.v}"`);
    if (op === 'in') {
      this.expect('(');
      const values: Array<string | number> = [];
      while (true) {
        const v = this.next();
        values.push(v.t === 'word' && /^-?\d+(?:\.\d+)?$/.test(v.v) ? Number(v.v) : v.v);
        const sep = this.next();
        if (sep.v === ')') break;
        if (sep.v !== ',') throw new Error(`Expected "," or ")" in in(...) list, found "${sep.v}"`);
      }
      spec.where!.push({ field, op, value: values });
      return;
    }
    const v = this.next();
    if (v.t !== 'str' && v.t !== 'word') throw new Error(`Expected a value after "${field} ${op}", found "${v.v}"`);
    spec.where!.push({ field, op, value: v.t === 'word' && /^-?\d+(?:\.\d+)?$/.test(v.v) ? Number(v.v) : v.v });
  }

  private parenField(): string {
    this.expect('(');
    const f = this.next();
    this.expect(')');
    return f.v;
  }

  private byClause(spec: QuerySpec): void {
    if (!this.isWord('by')) return;
    this.next();
    this.expect('(');
    const fields: string[] = [];
    while (true) {
      fields.push(this.next().v);
      const sep = this.next();
      if (sep.v === ')') break;
      if (sep.v !== ',') throw new Error(`Expected "," or ")" in by(...), found "${sep.v}"`);
    }
    spec.groupBy = fields;
  }

  private stage(spec: QuerySpec): void {
    const t = this.next();
    const name = t.v.toLowerCase();
    switch (name) {
      case 'count':
        spec.aggregate = { op: 'count' };
        this.byClause(spec);
        return;
      case 'count_over_time': {
        this.expect('(');
        spec.bucket = this.next().v;
        this.expect(')');
        spec.aggregate = { op: 'count' };
        this.byClause(spec);
        return;
      }
      case 'sum': case 'avg': case 'min': case 'max': case 'count_distinct': {
        spec.aggregate = { op: name, field: this.parenField() };
        this.byClause(spec);
        return;
      }
      case 'percentiles': {
        this.expect('(');
        const field = this.next().v;
        const ps: number[] = [];
        while (this.peek()?.v === ',') { this.next(); ps.push(Number(this.next().v)); }
        this.expect(')');
        spec.aggregate = { op: 'percentiles', field, percentiles: ps.length ? ps : [50, 95, 99] };
        this.byClause(spec);
        return;
      }
      case 'top': spec.topK = this.intArg('top'); return;
      case 'limit': spec.limit = this.intArg('limit'); return;
      case 'newest': spec.newest = true; return;
      case 'where': this.filters(spec); return;
      default:
        throw new Error(`Unknown stage "${t.v}" (count, count_over_time, sum, avg, min, max, count_distinct, percentiles, top, limit, newest, where)`);
    }
  }

  private intArg(stage: string): number {
    const n = Number(this.next().v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${stage} expects a positive integer`);
    return n;
  }
}

export function parseQuery(src: string): QuerySpec {
  const toks = tokenize(src.trim());
  if (toks.length === 0) return {};
  return new Parser(toks).parse();
}

// ---------------------------------------------------------------- evaluation

interface CompiledCondition {
  c: Condition;
  test: (e: LogEntry) => boolean;
}

function compileRegex(v: unknown): RegExp {
  let s = String(v);
  let flags = '';
  if (s.startsWith('(?i)')) { s = s.slice(4); flags = 'i'; }
  return safeRegex(s, flags);
}

function compare(a: unknown, b: unknown, field: string): number | null {
  if (field.toLowerCase() === 'level') {
    const la = typeof a === 'string' ? toLevel(a) : null;
    const lb = toLevel(b);
    if (la && lb) return levelRank(la) - levelRank(lb);
    return null;
  }
  if (field.toLowerCase() === 'timestamp' || field.toLowerCase() === 'time') {
    const da = parseTimestamp(a);
    const db = parseTimestamp(b);
    if (da && db) return da.getTime() - db.getTime();
    return null;
  }
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

function equals(a: unknown, b: unknown, field: string): boolean {
  if (a === undefined || a === null) return false;
  if (field.toLowerCase() === 'level') return toLevel(a) === toLevel(b);
  if (typeof b === 'number') return toNumber(a) === b;
  if (typeof a === 'object') return JSON.stringify(a) === String(b);
  return String(a) === String(b);
}

export function compileConditions(where: Condition[]): CompiledCondition[] {
  return where.map((c) => {
    const f = c.field;
    const get = (e: LogEntry) => getField(e, f);
    switch (c.op) {
      case 'exists': return { c, test: (e) => { const v = get(e); return v !== undefined && v !== null && v !== ''; } };
      case '!exists': return { c, test: (e) => { const v = get(e); return v === undefined || v === null || v === ''; } };
      case '=': return { c, test: (e) => equals(get(e), c.value, f) };
      case '!=': return { c, test: (e) => !equals(get(e), c.value, f) };
      case '=~': { const re = compileRegex(c.value); return { c, test: (e) => { const v = get(e); return v !== undefined && v !== null && re.test(fieldKey(v)); } }; }
      case '!~': { const re = compileRegex(c.value); return { c, test: (e) => { const v = get(e); return v === undefined || v === null || !re.test(fieldKey(v)); } }; }
      case 'contains': { const s = String(c.value).toLowerCase(); return { c, test: (e) => { const v = get(e); return v !== undefined && v !== null && fieldKey(v).toLowerCase().includes(s); } }; }
      case '!contains': { const s = String(c.value).toLowerCase(); return { c, test: (e) => { const v = get(e); return v === undefined || v === null || !fieldKey(v).toLowerCase().includes(s); } }; }
      case 'in': {
        const vals = Array.isArray(c.value) ? c.value : [c.value as string];
        return { c, test: (e) => { const v = get(e); return vals.some((x) => equals(v, x, f)); } };
      }
      case '>': case '>=': case '<': case '<=': return {
        c,
        test: (e) => {
          const r = compare(get(e), c.value, f);
          if (r === null) return false;
          return c.op === '>' ? r > 0 : c.op === '>=' ? r >= 0 : c.op === '<' ? r < 0 : r <= 0;
        },
      };
      default: throw new Error(`Unsupported operator ${(c as Condition).op}`);
    }
  });
}

interface GroupAcc {
  key: Record<string, string>;
  bucket?: string;
  count: number;
  numeric: number;
  sum: number;
  min: number;
  max: number;
  reservoir?: Reservoir;
  distinct?: Set<string>;
}

const MAX_GROUPS = 10000;

export async function queryLogs(
  input: SourceInput,
  spec: QuerySpec,
  o: { startTime?: Date; endTime?: Date },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const conds = compileConditions(spec.where ?? []);
  const texts = (spec.text ?? []).map((t) => t.toLowerCase());
  const notTexts = (spec.notText ?? []).map((t) => t.toLowerCase());
  const bucketMs = spec.bucket ? parseWindow(spec.bucket) : undefined;
  const agg = spec.aggregate;
  if (agg && agg.op !== 'count' && !agg.field) throw new Error(`${agg.op} needs a field`);

  const matches = (e: LogEntry) => {
    if (texts.length || notTexts.length) {
      const hay = e.raw.toLowerCase();
      if (texts.some((t) => !hay.includes(t))) return false;
      if (notTexts.some((t) => hay.includes(t))) return false;
    }
    return conds.every((c) => c.test(e));
  };

  // ---- entries mode
  if (!agg) {
    const limit = Math.min(spec.limit ?? 50, 500);
    const out: LogEntry[] = [];
    let total = 0;
    const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => {
      if (!matches(e)) return;
      total++;
      if (spec.newest) {
        out.push(e);
        if (out.length > limit) out.shift();
      } else if (out.length < limit) out.push(e);
    }, deps);
    const entries = spec.newest ? out.reverse() : out;
    return {
      mode: 'entries',
      totalMatches: total,
      returned: entries.length,
      ...(total > entries.length ? { truncated: true } : {}),
      entries: entries.map((e) => serializeEntry(e, { maxFrames: 10, maxMessage: 1500 })),
      query: spec,
      scan: describeScan(summary),
    };
  }

  // ---- aggregation mode
  const groups = new Map<string, GroupAcc>();
  let overflow = 0;
  let noTimestamp = 0;
  let nonNumeric = 0;
  const groupBy = spec.groupBy ?? [];
  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => {
    if (!matches(e)) return;
    let bucket: string | undefined;
    if (bucketMs) {
      if (!e.timestamp) { noTimestamp++; return; }
      bucket = bucketKey(e.timestamp, bucketMs);
    }
    const key: Record<string, string> = {};
    for (const g of groupBy) key[g] = fieldKey(getField(e, g));
    const id = JSON.stringify([bucket ?? '', ...groupBy.map((g) => key[g])]);
    let acc = groups.get(id);
    if (!acc) {
      if (groups.size >= MAX_GROUPS) { overflow++; return; }
      acc = {
        key, bucket, count: 0, numeric: 0, sum: 0, min: Infinity, max: -Infinity,
        reservoir: agg.op === 'percentiles' ? new Reservoir(groupBy.length || bucket ? 5000 : 50000) : undefined,
        distinct: agg.op === 'count_distinct' ? new Set() : undefined,
      };
      groups.set(id, acc);
    }
    acc.count++;
    if (agg.op === 'count') return;
    const raw = getField(e, agg.field!);
    if (agg.op === 'count_distinct') {
      if (raw !== undefined && acc.distinct!.size < 100000) acc.distinct!.add(fieldKey(raw));
      return;
    }
    const n = toNumber(raw);
    if (n === null) { nonNumeric++; return; }
    acc.numeric++;
    acc.sum += n;
    if (n < acc.min) acc.min = n;
    if (n > acc.max) acc.max = n;
    acc.reservoir?.add(n);
  }, deps);

  const valueOf = (a: GroupAcc): number => {
    switch (agg.op) {
      case 'count': return a.count;
      case 'sum': return a.sum;
      case 'avg': return a.numeric ? a.sum / a.numeric : NaN;
      case 'min': return a.numeric ? a.min : NaN;
      case 'max': return a.numeric ? a.max : NaN;
      case 'count_distinct': return a.distinct!.size;
      case 'percentiles': {
        const p = a.reservoir!.percentiles([Math.max(...(agg.percentiles ?? [95]))]);
        return Object.values(p)[0] ?? NaN;
      }
    }
  };

  let rows = [...groups.values()];
  const topK = spec.topK ?? (bucketMs ? undefined : 20);
  let groupsOmitted = 0;
  if (topK !== undefined) {
    if (bucketMs && groupBy.length) {
      // keep the top-K series by total count, all their buckets
      const totals = new Map<string, number>();
      for (const r of rows) {
        const k = JSON.stringify(groupBy.map((g) => r.key[g]));
        totals.set(k, (totals.get(k) ?? 0) + valueOf(r));
      }
      const keep = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([k]) => k));
      groupsOmitted = totals.size - keep.size;
      rows = rows.filter((r) => keep.has(JSON.stringify(groupBy.map((g) => r.key[g]))));
    } else if (!bucketMs) {
      rows.sort((a, b) => (valueOf(b) || 0) - (valueOf(a) || 0));
      groupsOmitted = Math.max(0, rows.length - topK);
      rows = rows.slice(0, topK);
    }
  }
  if (bucketMs) rows.sort((a, b) => (a.bucket! < b.bucket! ? -1 : a.bucket! > b.bucket! ? 1 : valueOf(b) - valueOf(a)));
  const MAX_ROWS = 2000;
  const rowsTruncated = rows.length > MAX_ROWS;
  rows = rows.slice(0, MAX_ROWS);

  const out = rows.map((r) => {
    const row: Record<string, unknown> = {};
    if (r.bucket) row.bucket = r.bucket;
    if (groupBy.length) row.group = r.key;
    row.count = r.count;
    switch (agg.op) {
      case 'count': break;
      case 'count_distinct': row.distinct = r.distinct!.size; break;
      case 'percentiles': Object.assign(row, r.reservoir!.summary(agg.percentiles ?? [50, 95, 99])); break;
      default: {
        const v = valueOf(r);
        row[agg.op] = Number.isNaN(v) ? null : round(v);
        if (r.numeric < r.count) row.withoutNumericValue = r.count - r.numeric;
      }
    }
    return row;
  });

  return {
    mode: 'aggregate',
    aggregate: agg,
    ...(groupBy.length ? { groupBy } : {}),
    ...(spec.bucket ? { bucket: spec.bucket } : {}),
    rows: out,
    ...(groupsOmitted ? { groupsOmitted } : {}),
    ...(rowsTruncated ? { truncated: true } : {}),
    ...(overflow ? { entriesBeyondGroupLimit: overflow } : {}),
    ...(noTimestamp ? { excludedNoTimestamp: noTimestamp } : {}),
    ...(nonNumeric ? { entriesWithNonNumericValue: nonNumeric } : {}),
    query: spec,
    scan: describeScan(summary),
  };
}
