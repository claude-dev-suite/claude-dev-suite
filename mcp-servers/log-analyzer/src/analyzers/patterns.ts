// SPDX-License-Identifier: MIT
/**
 * Known problem patterns (timeouts, connection failures, memory, disk, …),
 * matched in one streaming pass. With `timeWindowMinutes`, each pattern also
 * reports its busiest window.
 *
 * HTTP status patterns (429, 404) match the entry's parsed `status` field, not
 * the digits anywhere in the text — the old `/…|429/` matched any id or
 * timestamp containing "429".
 */

import type { LogEntry, Pattern, PatternCategory, SourceInput } from '../types.js';
import { getField, toNumber } from '../core/fields.js';
import { scan, type PipelineDeps } from '../pipeline/index.js';
import { bucketKey, describeScan, TimeSpan } from './output.js';

interface KnownPattern {
  regex?: RegExp;
  statuses?: number[];
  category: PatternCategory;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  suggestion: string;
}

export const KNOWN_PATTERNS: KnownPattern[] = [
  { regex: /\bsocket\s*timeout|\bread\s*timed?\s*out|\bconnect(?:ion)?\s*timed?\s*out/i, category: 'timeout', severity: 'critical', description: 'Network socket timeout', suggestion: 'Check network connectivity and server response times' },
  { regex: /\btime[ds]?\s*out\b|\btimeout\b|deadline\s*exceeded/i, category: 'timeout', severity: 'warning', description: 'Request or operation timeout', suggestion: 'Consider increasing timeout values or optimizing slow operations' },
  { regex: /connection\s*(?:refused|reset|closed|failed)|ECONNREFUSED|ECONNRESET|broken\s*pipe|EPIPE/i, category: 'connection', severity: 'critical', description: 'Connection failure', suggestion: 'Verify the target service is running and reachable' },
  { regex: /no\s*route\s*to\s*host|host\s*unreachable|ENOTFOUND|ENETUNREACH|name\s*resolution|getaddrinfo/i, category: 'connection', severity: 'critical', description: 'Network routing / DNS failure', suggestion: 'Check DNS, network configuration and firewall rules' },
  { regex: /connection\s*pool\s*(?:exhausted|empty|depleted)|unable\s*to\s*acquire\s*(?:jdbc\s*)?connection|HikariPool.*timeout/i, category: 'connection', severity: 'critical', description: 'Connection pool exhausted', suggestion: 'Increase pool size or investigate connection leaks' },
  { regex: /\bunauthori[sz]ed\b|authentication\s*failed|invalid\s*(?:token|credentials)|bad\s*credentials/i, statuses: [401], category: 'authentication', severity: 'warning', description: 'Authentication failure', suggestion: 'Check credentials and token validity' },
  { regex: /\bforbidden\b|access\s*denied|permission\s*denied|EACCES/i, statuses: [403], category: 'permission', severity: 'warning', description: 'Authorization failure', suggestion: 'Verify user permissions and access rights' },
  { regex: /token\s*expired|session\s*expired|jwt\s*expired/i, category: 'authentication', severity: 'info', description: 'Session or token expired', suggestion: 'Implement proper token refresh' },
  { regex: /\bdeadlock|lock\s*wait\s*timeout/i, category: 'database', severity: 'critical', description: 'Database deadlock or lock timeout', suggestion: 'Optimize transaction ordering and reduce lock duration' },
  { regex: /too\s*many\s*(?:connections|clients)|max(?:imum)?\s*connections/i, category: 'database', severity: 'critical', description: 'Database connection limit reached', suggestion: 'Increase max connections or reduce connection usage' },
  { regex: /slow\s*query|query\s*took\s*\d+\s*(?:ms|s)\b/i, category: 'database', severity: 'warning', description: 'Slow database query', suggestion: 'Add indexes or optimize the query' },
  { regex: /constraint\s*violation|duplicate\s*(?:key|entry)|unique\s*constraint/i, category: 'database', severity: 'warning', description: 'Database constraint violation', suggestion: 'Check for duplicate data or fix validation' },
  { regex: /out\s*of\s*memory|OutOfMemoryError|heap\s*space|\bOOM(?:Killed)?\b|oom-kill|memory\s*exhausted|JavaScript heap out of memory|MemoryError/i, category: 'memory', severity: 'critical', description: 'Memory exhaustion', suggestion: 'Increase memory limits or investigate leaks' },
  { regex: /gc\s*overhead|garbage\s*collection\s*overhead|long\s*gc\s*pause/i, category: 'memory', severity: 'warning', description: 'High garbage collection overhead', suggestion: 'Tune GC or reduce allocations' },
  { regex: /no\s*space\s*left|disk\s*full|insufficient\s*storage|ENOSPC/i, statuses: [507], category: 'disk', severity: 'critical', description: 'Disk space exhausted', suggestion: 'Free disk space or increase capacity' },
  { regex: /too\s*many\s*open\s*files|EMFILE|file\s*descriptor\s*limit/i, category: 'disk', severity: 'critical', description: 'File descriptor limit reached', suggestion: 'Raise ulimit or fix file handle leaks' },
  { regex: /rate\s*limit(?:ed|ing)?|too\s*many\s*requests|throttl(?:ed|ing)/i, statuses: [429], category: 'rate-limit', severity: 'warning', description: 'Rate limit exceeded', suggestion: 'Throttle requests or raise the limit' },
  { regex: /circuit\s*breaker\s*(?:is\s*)?(?:open|tripped)/i, category: 'rate-limit', severity: 'warning', description: 'Circuit breaker open', suggestion: 'Investigate downstream service health' },
  { regex: /validation\s*(?:failed|error)|invalid\s*(?:input|data|format|argument)/i, statuses: [400, 422], category: 'validation', severity: 'info', description: 'Input validation failure', suggestion: 'Review validation rules and error messages' },
  { regex: /NullPointerException|\bNPE\b|null\s*reference|undefined\s*is\s*not\s*(?:a\s*function|an\s*object)|cannot\s*read\s*propert(?:y|ies)\s*of\s*(?:undefined|null)|NoneType|nil\s*pointer\s*dereference/i, category: 'validation', severity: 'critical', description: 'Null/undefined reference', suggestion: 'Add null checks or fix the data flow' },
  { regex: /\bnot\s*found\b|no\s*such\s*(?:file|entity|record|key)|ENOENT/i, statuses: [404], category: 'not-found', severity: 'info', description: 'Resource not found', suggestion: 'Verify the resource exists or handle absence gracefully' },
  { regex: /configuration\s*(?:error|invalid)|missing\s*(?:config|property|environment variable)|failed\s*to\s*bind\s*properties/i, category: 'configuration', severity: 'critical', description: 'Configuration error', suggestion: 'Review application configuration' },
  { regex: /^panic:|\bpanic\b.*goroutine|segmentation\s*fault|SIGSEGV|core\s*dumped|fatal\s*error:|exit(?:ed)?\s*(?:with\s*)?code\s*(?:137|139)|CrashLoopBackOff|Back-off restarting/i, category: 'crash', severity: 'critical', description: 'Process crash / restart loop', suggestion: 'Inspect the crash stack and container restart reasons' },
];

interface Acc {
  def: KnownPattern;
  count: number;
  span: TimeSpan;
  examples: string[];
  buckets?: Map<string, number>;
}

export class PatternAccumulator {
  private readonly acc = new Map<number, Acc>();
  constructor(private readonly windowMs?: number) {}

  add(e: LogEntry): void {
    const text = e.exception ? `${e.message}\n${e.exception.type}: ${e.exception.message}` : e.message;
    const status = toNumber(getField(e, 'status'));
    KNOWN_PATTERNS.forEach((p, idx) => {
      const statusHit = status !== null && p.statuses?.includes(status);
      if (!statusHit && !(p.regex && p.regex.test(text))) return;
      let a = this.acc.get(idx);
      if (!a) {
        a = { def: p, count: 0, span: new TimeSpan(), examples: [], buckets: this.windowMs ? new Map() : undefined };
        this.acc.set(idx, a);
      }
      a.count++;
      a.span.add(e.timestamp);
      if (a.examples.length < 3) a.examples.push(e.message.split('\n')[0].slice(0, 300));
      if (a.buckets && e.timestamp && a.buckets.size < 20000) {
        const k = bucketKey(e.timestamp, this.windowMs!);
        a.buckets.set(k, (a.buckets.get(k) ?? 0) + 1);
      }
    });
  }

  patterns(minOccurrences: number): Pattern[] {
    const out: Pattern[] = [];
    for (const a of this.acc.values()) {
      if (a.count < minOccurrences) continue;
      let peakWindow: Pattern['peakWindow'];
      if (a.buckets && a.buckets.size) {
        const [start, count] = [...a.buckets.entries()].sort((x, y) => y[1] - x[1])[0];
        peakWindow = { start, count };
      }
      out.push({
        pattern: a.def.regex?.source ?? `status in ${a.def.statuses?.join(',')}`,
        description: a.def.description,
        category: a.def.category,
        count: a.count,
        severity: a.def.severity,
        firstOccurrence: a.span.start,
        lastOccurrence: a.span.end,
        examples: a.examples,
        suggestion: a.def.suggestion,
        ...(peakWindow ? { peakWindow } : {}),
      });
    }
    const order = { critical: 0, warning: 1, info: 2 };
    return out.sort((x, y) => order[x.severity] - order[y.severity] || y.count - x.count);
  }
}

export function recommendations(patterns: Pattern[]): string[] {
  const recs: string[] = [];
  const seen = new Set<PatternCategory>();
  const text: Partial<Record<PatternCategory, string>> = {
    memory: 'Memory issues: run heap analysis and check for leaks / container memory limits.',
    database: 'Database issues: check slow query logs and connection pool settings.',
    connection: 'Connection failures: verify downstream service health and network connectivity.',
    timeout: 'Timeouts: review timeout budgets and optimise slow operations.',
    disk: 'Disk issues: check free space and file descriptor limits.',
    crash: 'Crashes: inspect the crash stack and restart reasons (OOMKilled, exit 137/139).',
    configuration: 'Configuration errors: review application configuration and environment.',
  };
  for (const p of patterns) {
    if (p.severity !== 'critical' || seen.has(p.category) || !text[p.category]) continue;
    seen.add(p.category);
    recs.push(`CRITICAL (${p.count}×): ${text[p.category]}`);
  }
  if (patterns.some((p) => p.category === 'rate-limit')) recs.push('Rate limiting seen: add client throttling or exponential backoff.');
  if (patterns.some((p) => p.category === 'validation' && p.severity !== 'critical')) recs.push('Validation failures seen: review input validation and error messages.');
  return recs;
}

export async function analyzePatterns(
  input: SourceInput,
  o: { minOccurrences?: number; timeWindowMinutes?: number; startTime?: Date; endTime?: Date },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const windowMs = o.timeWindowMinutes ? o.timeWindowMinutes * 60000 : undefined;
  const acc = new PatternAccumulator(windowMs);
  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => acc.add(e), deps);
  const patterns = acc.patterns(o.minOccurrences ?? 2);
  const byCat = new Map<PatternCategory, number>();
  for (const p of patterns) byCat.set(p.category, (byCat.get(p.category) ?? 0) + p.count);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    patterns: patterns.map((p) => ({
      ...p,
      firstOccurrence: p.firstOccurrence?.toISOString() ?? null,
      lastOccurrence: p.lastOccurrence?.toISOString() ?? null,
    })),
    summary: {
      totalPatterns: patterns.length,
      criticalPatterns: patterns.filter((p) => p.severity === 'critical').length,
      warningPatterns: patterns.filter((p) => p.severity === 'warning').length,
      topCategory: top ? top[0] : null,
    },
    ...(windowMs ? { timeWindowMinutes: o.timeWindowMinutes } : {}),
    recommendations: recommendations(patterns),
    scan: describeScan(summary),
  };
}
