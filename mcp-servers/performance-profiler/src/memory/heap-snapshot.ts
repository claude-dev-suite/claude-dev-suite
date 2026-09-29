// SPDX-License-Identifier: MIT
/**
 * V8 .heapsnapshot parsing and comparison.
 *
 * The comparison mirrors DevTools' "Comparison" view: V8 object ids are stable
 * across snapshots of the same isolate, so objects present in the second
 * snapshot but not the first were allocated in between *and are still alive*.
 * Sizes are shallow (self) sizes — retained sizes need a dominator tree, which
 * is not computed here.
 */

import { readFile, stat } from 'fs/promises';
import { round } from '../utils/statistics.js';

const MAX_SNAPSHOT_BYTES = 400 * 1024 * 1024;

interface RawSnapshot {
  snapshot: { meta: { node_fields: string[]; node_types: [string[] | string, ...unknown[]] } };
  nodes: number[];
  strings: string[];
}

export interface ParsedSnapshot {
  /** object id → class index */
  ids: Map<number, number>;
  sizes: Map<number, number>;
  classes: string[];
  totalSize: number;
  nodeCount: number;
}

function classOf(type: string, name: string): string | null {
  switch (type) {
    case 'object':
      return name.startsWith('system /') ? '(system)' : name || '(anonymous object)';
    case 'closure':
      return '(closure)';
    case 'string':
    case 'concatenated string':
    case 'sliced string':
      return '(string)';
    case 'array':
      return '(array)';
    case 'code':
      return '(compiled code)';
    case 'regexp':
      return 'RegExp';
    case 'number':
    case 'heap number':
      return '(number)';
    case 'hidden':
      return '(system)';
    case 'object shape':
      return '(object shape)';
    case 'bigint':
      return 'BigInt';
    case 'symbol':
      return 'Symbol';
    case 'native':
      return name || '(native)';
    case 'synthetic':
      return null;
    default:
      return `(${type})`;
  }
}

export function parseSnapshotJson(raw: RawSnapshot): ParsedSnapshot {
  const fields = raw.snapshot.meta.node_fields;
  const types = raw.snapshot.meta.node_types[0];
  if (!Array.isArray(types)) throw new Error('Unexpected heap snapshot format: node_types[0] is not an array');
  const width = fields.length;
  const fType = fields.indexOf('type');
  const fName = fields.indexOf('name');
  const fId = fields.indexOf('id');
  const fSize = fields.indexOf('self_size');
  if ([fType, fName, fId, fSize].some((i) => i < 0)) throw new Error('Unexpected heap snapshot format: missing node fields');

  const classIndex = new Map<string, number>();
  const classes: string[] = [];
  const ids = new Map<number, number>();
  const sizes = new Map<number, number>();
  let totalSize = 0;
  let nodeCount = 0;
  const nodes = raw.nodes;
  for (let i = 0; i + width <= nodes.length; i += width) {
    const cls = classOf(types[nodes[i + fType]], raw.strings[nodes[i + fName]] ?? '');
    if (cls === null) continue;
    let ci = classIndex.get(cls);
    if (ci === undefined) {
      ci = classes.length;
      classes.push(cls);
      classIndex.set(cls, ci);
    }
    const id = nodes[i + fId];
    const size = nodes[i + fSize];
    ids.set(id, ci);
    sizes.set(id, size);
    totalSize += size;
    nodeCount++;
  }
  return { ids, sizes, classes, totalSize, nodeCount };
}

export async function parseSnapshotFile(path: string): Promise<ParsedSnapshot> {
  const st = await stat(path);
  if (st.size > MAX_SNAPSHOT_BYTES) {
    throw new Error(
      `Heap snapshot ${path} is ${Math.round(st.size / 1048576)} MB, above the ${MAX_SNAPSHOT_BYTES / 1048576} MB ` +
        'in-process diff limit. Open it in Chrome DevTools (Memory tab → Load) instead.'
    );
  }
  return parseSnapshotJson(JSON.parse(await readFile(path, 'utf-8')) as RawSnapshot);
}

export interface ClassGrowth {
  constructor: string;
  countBefore: number;
  countAfter: number;
  sizeBefore: number;
  sizeAfter: number;
  /** Objects allocated between the snapshots and still alive in the second. */
  newObjects: number;
  newSize: number;
  /** Objects from the first snapshot that were freed by the second. */
  freedObjects: number;
  freedSize: number;
  netSizeDelta: number;
}

export interface SnapshotDiff {
  totalSizeBefore: number;
  totalSizeAfter: number;
  netSizeDelta: number;
  nodeCountBefore: number;
  nodeCountAfter: number;
  topGrowth: ClassGrowth[];
  truncated: boolean;
  sizeKind: 'shallow';
}

export function diffSnapshots(a: ParsedSnapshot, b: ParsedSnapshot, limit = 20): SnapshotDiff {
  const rows = new Map<string, ClassGrowth>();
  const row = (name: string): ClassGrowth => {
    let r = rows.get(name);
    if (!r) {
      r = {
        constructor: name, countBefore: 0, countAfter: 0, sizeBefore: 0, sizeAfter: 0,
        newObjects: 0, newSize: 0, freedObjects: 0, freedSize: 0, netSizeDelta: 0,
      };
      rows.set(name, r);
    }
    return r;
  };
  for (const [id, ci] of a.ids) {
    const r = row(a.classes[ci]);
    const size = a.sizes.get(id) ?? 0;
    r.countBefore++;
    r.sizeBefore += size;
    if (!b.ids.has(id)) {
      r.freedObjects++;
      r.freedSize += size;
    }
  }
  for (const [id, ci] of b.ids) {
    const r = row(b.classes[ci]);
    const size = b.sizes.get(id) ?? 0;
    r.countAfter++;
    r.sizeAfter += size;
    if (!a.ids.has(id)) {
      r.newObjects++;
      r.newSize += size;
    }
  }
  const all = [...rows.values()];
  for (const r of all) r.netSizeDelta = r.sizeAfter - r.sizeBefore;
  const growing = all.filter((r) => r.netSizeDelta > 0 || r.newObjects > r.freedObjects);
  growing.sort((x, y) => y.netSizeDelta - x.netSizeDelta || y.newObjects - x.newObjects);
  const cap = Math.max(1, Math.min(limit, 200));
  return {
    totalSizeBefore: a.totalSize,
    totalSizeAfter: b.totalSize,
    netSizeDelta: b.totalSize - a.totalSize,
    nodeCountBefore: a.nodeCount,
    nodeCountAfter: b.nodeCount,
    topGrowth: growing.slice(0, cap),
    truncated: growing.length > cap,
    sizeKind: 'shallow',
  };
}

// ---------------------------------------------------------------------------
// Sampling heap profile (.heapprofile)
// ---------------------------------------------------------------------------

interface HeapProfileNode {
  callFrame: { functionName: string; url: string; lineNumber: number };
  selfSize: number;
  children?: HeapProfileNode[];
}

export interface AllocationSite {
  function: string;
  file: string;
  line: number;
  liveBytes: number;
  percent: number;
}

/** Aggregate a sampling heap profile by allocation site (live sampled bytes). */
export function summarizeHeapProfile(profile: { head: HeapProfileNode }, limit = 15): { sites: AllocationSite[]; totalBytes: number } {
  const agg = new Map<string, AllocationSite>();
  let total = 0;
  const stack: HeapProfileNode[] = [profile.head];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.selfSize > 0) {
      const key = `${n.callFrame.functionName}\0${n.callFrame.url}\0${n.callFrame.lineNumber}`;
      let s = agg.get(key);
      if (!s) {
        s = {
          function: n.callFrame.functionName || '(anonymous)',
          file: n.callFrame.url || '(native)',
          line: n.callFrame.lineNumber + 1,
          liveBytes: 0,
          percent: 0,
        };
        agg.set(key, s);
      }
      s.liveBytes += n.selfSize;
      total += n.selfSize;
    }
    for (const c of n.children ?? []) stack.push(c);
  }
  const sites = [...agg.values()].sort((a, b) => b.liveBytes - a.liveBytes).slice(0, limit);
  for (const s of sites) s.percent = total > 0 ? round((s.liveBytes / total) * 100, 2) : 0;
  return { sites, totalBytes: total };
}
