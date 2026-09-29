// SPDX-License-Identifier: MIT
/**
 * Runtime-neutral sampled profile model.
 *
 * Every CPU profiler this server drives (V8 .cpuprofile, JFR, py-spy, Go
 * pprof, dotnet-trace/speedscope) is converted into the same shape: a list of
 * stacks (root → leaf, as indices into an interned frame table) with a weight
 * each. From that one model we derive correct self and total time (total =
 * weight of every sample the function appears in, counted once per sample even
 * under recursion), collapsed stacks, speedscope JSON and a flame graph.
 *
 * The old code counted every frame of a JFR stack as self time and reported
 * self time as total time for Node; both fall out of this model correctly.
 */

import { round } from '../utils/statistics.js';

export interface Frame {
  name: string;
  file?: string;
  line?: number;
}

export type ProfileUnit = 'milliseconds' | 'samples';

export interface SampledProfile {
  name: string;
  frames: Frame[];
  /** Root → leaf frame indices. */
  stacks: number[][];
  weights: number[];
  unit: ProfileUnit;
  /** For `samples` profiles: the approximate sampling interval, used to estimate ms. */
  sampleIntervalMs?: number;
}

/** Frames that are bookkeeping rather than code (V8 meta nodes). */
export const META_FRAMES = new Set(['(root)', '(program)', '(idle)', '(garbage collector)']);

export class ProfileBuilder {
  private readonly index = new Map<string, number>();
  readonly profile: SampledProfile;

  constructor(name: string, unit: ProfileUnit, sampleIntervalMs?: number) {
    this.profile = { name, frames: [], stacks: [], weights: [], unit, sampleIntervalMs };
  }

  /** Intern a frame by function identity (name + file), keeping the first line seen. */
  frame(f: Frame): number {
    const key = `${f.name}\u0000${f.file ?? ''}`;
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.profile.frames.length;
      this.profile.frames.push({ name: f.name, file: f.file, line: f.line });
      this.index.set(key, i);
    }
    return i;
  }

  add(stackRootToLeaf: number[], weight: number): void {
    if (!(weight > 0) || stackRootToLeaf.length === 0) return;
    this.profile.stacks.push(stackRootToLeaf);
    this.profile.weights.push(weight);
  }
}

/** Remove samples whose stack contains a frame matching `pred` (e.g. the profiler's own agent). */
export function dropSamplesWithFrame(p: SampledProfile, pred: (f: Frame) => boolean): SampledProfile {
  const bad = new Set<number>();
  p.frames.forEach((f, i) => pred(f) && bad.add(i));
  if (bad.size === 0) return p;
  const stacks: number[][] = [];
  const weights: number[] = [];
  p.stacks.forEach((st, i) => {
    if (!st.some((f) => bad.has(f))) {
      stacks.push(st);
      weights.push(p.weights[i]);
    }
  });
  return { ...p, stacks, weights };
}

export function totalWeight(p: SampledProfile): number {
  let t = 0;
  for (const w of p.weights) t += w;
  return t;
}

/** Convert a weight to milliseconds (sample profiles use the sampling interval). */
export function toMs(p: SampledProfile, w: number): number {
  return p.unit === 'milliseconds' ? w : w * (p.sampleIntervalMs ?? 0);
}

export interface FunctionStat {
  name: string;
  file: string;
  line: number;
  /** Milliseconds (estimated from sample counts for sample-based profiles). */
  selfTime: number;
  totalTime: number;
  selfPercent: number;
  totalPercent: number;
  /** Back-compat alias of selfPercent. */
  percentage: number;
  selfSamples?: number;
  totalSamples?: number;
  /** Exact call count — only deterministic profilers (cProfile) provide it. */
  calls?: number;
}

/** Self/total per function over the whole profile, sorted by self time. */
export function computeFunctionStats(p: SampledProfile, opts: { includeMeta?: boolean } = {}): FunctionStat[] {
  const self = new Float64Array(p.frames.length);
  const total = new Float64Array(p.frames.length);
  const selfN = new Float64Array(p.frames.length);
  const totalN = new Float64Array(p.frames.length);
  const seen = new Int32Array(p.frames.length).fill(-1);
  const all = totalWeight(p);

  for (let s = 0; s < p.stacks.length; s++) {
    const stack = p.stacks[s];
    const w = p.weights[s];
    const leaf = stack[stack.length - 1];
    self[leaf] += w;
    selfN[leaf] += 1;
    for (const f of stack) {
      if (seen[f] === s) continue; // recursion: count each function once per sample
      seen[f] = s;
      total[f] += w;
      totalN[f] += 1;
    }
  }

  const out: FunctionStat[] = [];
  for (let i = 0; i < p.frames.length; i++) {
    const fr = p.frames[i];
    if (!opts.includeMeta && META_FRAMES.has(fr.name)) continue;
    if (total[i] === 0) continue;
    const selfPercent = all > 0 ? round((self[i] / all) * 100, 2) : 0;
    const stat: FunctionStat = {
      name: fr.name,
      file: fr.file ?? '',
      line: fr.line ?? 0,
      selfTime: round(toMs(p, self[i]), 3),
      totalTime: round(toMs(p, total[i]), 3),
      selfPercent,
      totalPercent: all > 0 ? round((total[i] / all) * 100, 2) : 0,
      percentage: selfPercent,
    };
    if (p.unit === 'samples') {
      stat.selfSamples = self[i];
      stat.totalSamples = total[i];
    }
    out.push(stat);
  }
  out.sort((a, b) => b.selfTime - a.selfTime || b.totalTime - a.totalTime || (b.selfSamples ?? 0) - (a.selfSamples ?? 0));
  return out;
}

/** Share of total weight whose leaf frame is one of `names`. */
export function leafShare(p: SampledProfile, predicate: (f: Frame) => boolean): number {
  const all = totalWeight(p);
  if (all === 0) return 0;
  let w = 0;
  for (let s = 0; s < p.stacks.length; s++) {
    const st = p.stacks[s];
    if (predicate(p.frames[st[st.length - 1]])) w += p.weights[s];
  }
  return w / all;
}

// ---------------------------------------------------------------------------
// Call tree (for hot paths and the flame graph)
// ---------------------------------------------------------------------------

export interface TreeNode {
  frame: number;
  total: number;
  self: number;
  children: Map<number, TreeNode>;
}

export function buildTree(p: SampledProfile): TreeNode {
  const root: TreeNode = { frame: -1, total: 0, self: 0, children: new Map() };
  for (let s = 0; s < p.stacks.length; s++) {
    const w = p.weights[s];
    let node = root;
    node.total += w;
    for (const f of p.stacks[s]) {
      let child = node.children.get(f);
      if (!child) {
        child = { frame: f, total: 0, self: 0, children: new Map() };
        node.children.set(f, child);
      }
      child.total += w;
      node = child;
    }
    node.self += w;
  }
  return root;
}

export interface HotPath {
  /** Root → leaf function names. */
  path: string[];
  totalTime: number;
  percent: number;
}

/** The heaviest root→leaf call paths (following the heaviest child at each level). */
export function hotPaths(p: SampledProfile, limit = 5, maxDepth = 40): HotPath[] {
  const root = buildTree(p);
  const all = root.total;
  const out: HotPath[] = [];
  const leaves: Array<{ path: number[]; weight: number }> = [];
  const walk = (node: TreeNode, path: number[]) => {
    if (path.length >= maxDepth || node.children.size === 0) {
      leaves.push({ path, weight: node.total });
      return;
    }
    if (node.self > 0) leaves.push({ path, weight: node.self });
    for (const c of node.children.values()) walk(c, [...path, c.frame]);
  };
  for (const c of root.children.values()) walk(c, [c.frame]);
  leaves.sort((a, b) => b.weight - a.weight);
  for (const l of leaves.slice(0, limit)) {
    out.push({
      path: l.path.map((i) => p.frames[i].name),
      totalTime: round(toMs(p, l.weight), 3),
      percent: all > 0 ? round((l.weight / all) * 100, 2) : 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Serialisers
// ---------------------------------------------------------------------------

function collapsedName(f: Frame): string {
  const loc = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : '';
  return `${f.name}${loc}`.replace(/[;\r\n]/g, '_');
}

/**
 * Brendan Gregg collapsed stacks (`a;b;c 42`). Weights are integers: sample
 * counts for sampled profiles, microseconds for millisecond profiles.
 */
export function toCollapsed(p: SampledProfile): { text: string; unit: 'samples' | 'microseconds' } {
  const agg = new Map<string, number>();
  for (let s = 0; s < p.stacks.length; s++) {
    const key = p.stacks[s].map((i) => collapsedName(p.frames[i])).join(';');
    const w = p.unit === 'milliseconds' ? Math.round(p.weights[s] * 1000) : p.weights[s];
    agg.set(key, (agg.get(key) ?? 0) + w);
  }
  const lines: string[] = [];
  for (const [k, v] of agg) if (v > 0) lines.push(`${k} ${v}`);
  lines.sort();
  return { text: lines.join('\n') + '\n', unit: p.unit === 'milliseconds' ? 'microseconds' : 'samples' };
}

/** speedscope file format (https://www.speedscope.app/file-format-schema.json), sampled profile. */
export function toSpeedscope(p: SampledProfile): object {
  const end = totalWeight(p);
  return {
    $schema: 'https://www.speedscope.app/file-format-schema.json',
    shared: { frames: p.frames.map((f) => ({ name: f.name, ...(f.file ? { file: f.file } : {}), ...(f.line ? { line: f.line } : {}) })) },
    profiles: [
      {
        type: 'sampled',
        name: p.name,
        unit: p.unit === 'milliseconds' ? 'milliseconds' : 'none',
        startValue: 0,
        endValue: end,
        samples: p.stacks,
        weights: p.weights,
      },
    ],
    name: p.name,
    activeProfileIndex: 0,
    exporter: 'dev-suite performance-profiler',
  };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = 10 + (h % 45); // warm: red → yellow
  const light = 55 + ((h >>> 8) % 15);
  return `hsl(${hue},85%,${light}%)`;
}

/**
 * Self-contained icicle-style flame graph SVG (root on top, width = total
 * time). Nodes narrower than `minFraction` of the total are elided to bound
 * the file size; the count of elided nodes is embedded as a comment.
 */
export function toFlameGraphSvg(p: SampledProfile, opts: { width?: number; minFraction?: number; maxNodes?: number } = {}): string {
  const width = opts.width ?? 1200;
  const minFraction = opts.minFraction ?? 0.001;
  const maxNodes = opts.maxNodes ?? 20_000;
  const rowH = 17;
  const root = buildTree(p);
  const all = root.total || 1;
  const rects: string[] = [];
  let maxDepth = 0;
  let elided = 0;

  const unitLabel = (w: number) =>
    p.unit === 'milliseconds' ? `${round(w, 2)} ms` : `${w} samples${p.sampleIntervalMs ? ` (~${round(w * p.sampleIntervalMs, 1)} ms)` : ''}`;

  const stack: Array<{ node: TreeNode; x: number; depth: number }> = [];
  let x0 = 0;
  const kids = [...root.children.values()].sort((a, b) => b.total - a.total);
  for (const c of kids) {
    stack.push({ node: c, x: x0, depth: 0 });
    x0 += c.total;
  }
  stack.reverse();
  while (stack.length > 0) {
    const { node, x, depth } = stack.pop()!;
    if (node.total / all < minFraction || rects.length >= maxNodes) {
      elided++;
      continue;
    }
    maxDepth = Math.max(maxDepth, depth);
    const f = p.frames[node.frame];
    const px = (x / all) * width;
    const pw = (node.total / all) * width;
    const label = f.name;
    const title = `${f.name}${f.file ? ` — ${f.file}${f.line ? `:${f.line}` : ''}` : ''}\n` +
      `total ${unitLabel(node.total)} (${round((node.total / all) * 100, 2)}%), self ${unitLabel(node.self)}`;
    const maxChars = Math.floor((pw - 6) / 7);
    const text = maxChars >= 3 ? (label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label) : '';
    rects.push(
      `<g><title>${escapeXml(title)}</title><rect x="${px.toFixed(2)}" y="${depth * rowH + 24}" width="${Math.max(pw - 0.5, 0.5).toFixed(2)}" height="${rowH - 1}" fill="${colorFor(label)}" rx="2"/>` +
        (text ? `<text x="${(px + 3).toFixed(2)}" y="${depth * rowH + 24 + 12}">${escapeXml(text)}</text>` : '') +
        `</g>`
    );
    let cx = x;
    const children = [...node.children.values()].sort((a, b) => b.total - a.total);
    const pending: Array<{ node: TreeNode; x: number; depth: number }> = [];
    for (const c of children) {
      pending.push({ node: c, x: cx, depth: depth + 1 });
      cx += c.total;
    }
    for (let i = pending.length - 1; i >= 0; i--) stack.push(pending[i]);
  }

  const height = (maxDepth + 1) * rowH + 40;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Menlo,Consolas,monospace" font-size="11">\n` +
    `<!-- generated by dev-suite performance-profiler; ${elided} node(s) below ${minFraction * 100}% elided -->\n` +
    `<style>text{fill:#1a1a1a;pointer-events:none} rect:hover{stroke:#000;stroke-width:1}</style>\n` +
    `<rect width="100%" height="100%" fill="#fdfaf5"/>\n` +
    `<text x="4" y="15" font-size="13">${escapeXml(p.name)} — total ${escapeXml(unitLabel(all))}</text>\n` +
    rects.join('\n') +
    `\n</svg>\n`
  );
}

// ---------------------------------------------------------------------------
// Importers
// ---------------------------------------------------------------------------

interface V8Node {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber?: number; scriptId?: string };
  hitCount?: number;
  children?: number[];
}

export interface V8CpuProfile {
  nodes: V8Node[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

/** V8 .cpuprofile → model. Each sample's weight is the following time delta (µs → ms). */
export function fromV8CpuProfile(data: V8CpuProfile, name = 'node'): SampledProfile {
  const b = new ProfileBuilder(name, 'milliseconds');
  const parent = new Map<number, number>();
  const byId = new Map<number, V8Node>();
  for (const n of data.nodes) {
    byId.set(n.id, n);
    for (const c of n.children ?? []) parent.set(c, n.id);
  }
  const stackCache = new Map<number, number[]>();
  const stackOf = (id: number): number[] => {
    const cached = stackCache.get(id);
    if (cached) return cached;
    const chain: number[] = [];
    let cur: number | undefined = id;
    while (cur !== undefined) {
      const n = byId.get(cur);
      if (!n) break;
      if (n.callFrame.functionName !== '(root)') {
        chain.push(
          b.frame({
            name: n.callFrame.functionName || '(anonymous)',
            file: n.callFrame.url || undefined,
            line: n.callFrame.lineNumber >= 0 ? n.callFrame.lineNumber + 1 : undefined,
          })
        );
      }
      cur = parent.get(cur);
    }
    chain.reverse();
    stackCache.set(id, chain);
    return chain;
  };

  const samples = data.samples ?? [];
  const deltas = data.timeDeltas ?? [];
  if (samples.length > 0 && deltas.length === samples.length) {
    // timeDeltas[i] is the gap *before* sample i; the time attributed to
    // sample i is the gap until the next one. The last sample gets the
    // remainder up to endTime (or the median gap when that is unavailable).
    for (let i = 0; i < samples.length; i++) {
      let dt: number;
      if (i + 1 < deltas.length) dt = deltas[i + 1];
      else {
        const elapsed = deltas.reduce((s, d) => s + d, 0);
        dt = Math.max(0, data.endTime - data.startTime - elapsed) || deltas[i];
      }
      if (dt <= 0) continue;
      b.add(stackOf(samples[i]), dt / 1000);
    }
  } else {
    // Profiles without a sample stream: fall back to hitCount × mean interval.
    const hits = data.nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0);
    const interval = hits > 0 ? (data.endTime - data.startTime) / hits / 1000 : 0;
    for (const n of data.nodes) if (n.hitCount) b.add(stackOf(n.id), n.hitCount * (interval || 1));
    if (interval === 0) b.profile.unit = 'samples';
  }
  return b.profile;
}

/** Collapsed stacks (`a;b;c 42`, root first) → model. py-spy `--format raw` emits this. */
export function fromCollapsed(text: string, name: string, unit: ProfileUnit = 'samples', sampleIntervalMs?: number): SampledProfile {
  const b = new ProfileBuilder(name, unit, sampleIntervalMs);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sp = line.lastIndexOf(' ');
    if (sp <= 0) continue;
    const w = Number(line.slice(sp + 1));
    if (!Number.isFinite(w) || w <= 0) continue;
    const frames = line.slice(0, sp).split(';').map((s) => {
      const m = s.match(/^(.*) \((.*?)(?::(\d+))?\)$/);
      return m ? b.frame({ name: m[1], file: m[2], line: m[3] ? Number(m[3]) : undefined }) : b.frame({ name: s });
    });
    b.add(frames, w);
  }
  return b.profile;
}

/**
 * `jfr print --stack-depth N --events jdk.ExecutionSample` text output → model.
 * The text form is ~20x smaller than `--json` and has the same frames. The
 * first frame of each stackTrace is the executing (leaf) method.
 */
export class JfrTextParser {
  private readonly b: ProfileBuilder;
  truncatedStacks = 0;
  private inEvent = false;
  private inStack = false;
  private frames: number[] = [];
  private truncated = false;

  constructor(name = 'java', sampleIntervalMs = 10) {
    this.b = new ProfileBuilder(name, 'samples', sampleIntervalMs);
  }

  push(raw: string): void {
    const line = raw.trim();
    if (line.startsWith('jdk.ExecutionSample {')) {
      this.inEvent = true;
      this.inStack = false;
      this.frames = [];
      this.truncated = false;
      return;
    }
    if (!this.inEvent) return;
    if (line.startsWith('stackTrace = [')) {
      this.inStack = true;
      return;
    }
    if (this.inStack) {
      if (line === ']') {
        this.inStack = false;
        if (this.frames.length > 0) {
          this.b.add([...this.frames].reverse(), 1);
          if (this.truncated) this.truncatedStacks++;
        }
        return;
      }
      if (line === '...') {
        this.truncated = true;
        return;
      }
      const m = line.match(/^(.+?)\((.*?)\)(?:\s+line:\s*(\d+))?/);
      if (!m) return;
      const qualified = m[1];
      const dot = qualified.lastIndexOf('.');
      const cls = dot > 0 ? qualified.slice(0, dot) : qualified;
      this.frames.push(this.b.frame({ name: qualified, file: cls, line: m[3] ? Number(m[3]) : undefined }));
      return;
    }
    if (line === '}') this.inEvent = false;
  }

  result(): { profile: SampledProfile; truncatedStacks: number } {
    return { profile: this.b.profile, truncatedStacks: this.truncatedStacks };
  }
}

export function fromJfrText(text: string, name = 'java', sampleIntervalMs = 10): { profile: SampledProfile; truncatedStacks: number } {
  const p = new JfrTextParser(name, sampleIntervalMs);
  for (const line of text.split(/\r?\n/)) p.push(line);
  return p.result();
}

/** Parse an ISO-8601 duration as printed by `jfr print --json` ("PT0.0061822S", "PT1M2.5S") to ms. */
export function parseIsoDurationMs(s: string): number {
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(-?\d+(?:\.\d+)?)S)?$/.exec(s);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
}

/** Parse a Go pprof duration token ("10ms", "1.20s", "500us", "3µs", "7ns", "1m2s") to ms. */
export function parseGoDuration(tok: string): number | null {
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  let total = 0;
  let matched = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(tok)) !== null) {
    const v = Number(m[1]);
    const mult: Record<string, number> = { ns: 1e-6, us: 1e-3, 'µs': 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
    total += v * mult[m[2]];
    matched += m[0];
  }
  return matched === tok ? total : null;
}

/** `go tool pprof -traces` output → model (leaf first within each block). */
export function fromPprofTraces(text: string, name = 'go'): SampledProfile {
  const b = new ProfileBuilder(name, 'milliseconds');
  const blocks = text.split(/^-{5,}\+-+\s*$/m);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    const first = lines[0].match(/^\s*(\S+)\s+(.+?)\s*$/);
    if (!first) continue;
    const w = parseGoDuration(first[1]);
    if (w === null) continue; // header block or a non-time sample type
    const names = [first[2], ...lines.slice(1).map((l) => l.trim())].filter((n) => n && !n.startsWith('bytes:'));
    const idx = names.map((n) => b.frame({ name: n }));
    b.add(idx.reverse(), w);
  }
  return b.profile;
}

interface SpeedscopeFile {
  shared?: { frames?: Array<{ name: string; file?: string; line?: number }> };
  profiles?: Array<
    | { type: 'sampled'; name?: string; unit?: string; samples: number[][]; weights: number[] }
    | { type: 'evented'; name?: string; unit?: string; events: Array<{ type: 'O' | 'C'; at: number; frame: number }> }
  >;
}

function unitToMs(unit: string | undefined): number | null {
  switch (unit) {
    case 'nanoseconds':
      return 1e-6;
    case 'microseconds':
      return 1e-3;
    case 'milliseconds':
      return 1;
    case 'seconds':
      return 1000;
    default:
      return null;
  }
}

/**
 * speedscope JSON (e.g. `dotnet-trace --format Speedscope`) → model. All
 * profiles (one per thread for dotnet-trace) are merged.
 */
export function fromSpeedscope(data: SpeedscopeFile, name = 'speedscope'): SampledProfile {
  const frames = data.shared?.frames ?? [];
  const firstUnit = data.profiles?.[0]?.unit;
  const mult = unitToMs(firstUnit);
  const b = new ProfileBuilder(name, mult === null ? 'samples' : 'milliseconds');
  const map = (i: number) => b.frame({ name: frames[i]?.name ?? `frame#${i}`, file: frames[i]?.file, line: frames[i]?.line });
  for (const prof of data.profiles ?? []) {
    const m = unitToMs(prof.unit) ?? 1;
    if (prof.type === 'sampled') {
      prof.samples.forEach((st, i) => b.add(st.map(map), (prof.weights[i] ?? 1) * (mult === null ? 1 : m)));
    } else if (prof.type === 'evented') {
      const stack: number[] = [];
      let last: number | undefined;
      for (const ev of prof.events) {
        if (last !== undefined && stack.length > 0 && ev.at > last) b.add([...stack], (ev.at - last) * (mult === null ? 1 : m));
        last = ev.at;
        if (ev.type === 'O') stack.push(map(ev.frame));
        else {
          const target = map(ev.frame);
          const pos = stack.lastIndexOf(target);
          if (pos >= 0) stack.length = pos;
        }
      }
    }
  }
  return b.profile;
}
