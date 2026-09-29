// SPDX-License-Identifier: MIT
/**
 * Drain log template mining (He et al., "Drain: An Online Log Parsing
 * Approach with Fixed Depth Tree", ICWS 2017).
 *
 * Messages are tokenised after masking obvious variables (numbers, ids, IPs,
 * UUIDs, hex, paths), routed through a fixed-depth tree keyed by token count
 * and the first tokens, and merged into the most similar cluster in the leaf
 * when similarity ≥ `simThreshold`; differing positions become `<*>`.
 */

export interface DrainOptions {
  depth?: number;          // tree depth including the length layer (≥ 3)
  simThreshold?: number;   // 0..1
  maxChildren?: number;    // per internal node
  maxClusters?: number;    // hard memory bound
}

export interface DrainCluster {
  id: number;
  tokens: string[];
  size: number;
}

interface Node {
  children: Map<string, Node>;
  clusters: DrainCluster[];
}

const WILDCARD = '<*>';

const MASKS: Array<[RegExp, string]> = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>'],
  [/\b0x[0-9a-f]+\b/gi, '<hex>'],
  [/\b[0-9a-f]{16,}\b/gi, '<hex>'],
  [/(?:^|(?<=\s))(?:\/[\w.@-]+){2,}\/?/g, '<path>'],
  [/(?<![\w<])-?\d+(?:\.\d+)?(?:ms|s|us|µs|ns|kb|mb|gb|b|%)?(?![\w>])/gi, '<num>'],
];

export function maskMessage(message: string): string {
  let out = message;
  for (const [re, repl] of MASKS) out = out.replace(re, repl);
  return out;
}

export function tokenize(message: string): string[] {
  return maskMessage(message).split(/\s+/).filter(Boolean).slice(0, 120);
}

function hasDigit(t: string): boolean {
  return /\d/.test(t);
}

export class Drain {
  private readonly depth: number;
  private readonly sim: number;
  private readonly maxChildren: number;
  private readonly maxClusters: number;
  private readonly root: Node = { children: new Map(), clusters: [] };
  readonly clusters: DrainCluster[] = [];
  /** Messages that could not get a cluster because maxClusters was reached. */
  unclustered = 0;

  constructor(opts: DrainOptions = {}) {
    this.depth = Math.max(3, opts.depth ?? 4);
    this.sim = opts.simThreshold ?? 0.4;
    this.maxChildren = opts.maxChildren ?? 100;
    this.maxClusters = opts.maxClusters ?? 5000;
  }

  /** Add a message; returns its cluster (or null when the cluster budget is exhausted). */
  add(message: string): DrainCluster | null {
    const tokens = tokenize(message);
    const leaf = this.leafFor(tokens);
    let best: DrainCluster | null = null;
    let bestSim = -1;
    let bestParams = 0;
    for (const c of leaf.clusters) {
      const [s, params] = similarity(c.tokens, tokens);
      if (s > bestSim || (s === bestSim && params > bestParams)) {
        best = c; bestSim = s; bestParams = params;
      }
    }
    if (best && bestSim >= this.sim) {
      best.tokens = merge(best.tokens, tokens);
      best.size++;
      return best;
    }
    if (this.clusters.length >= this.maxClusters) {
      this.unclustered++;
      return null;
    }
    const cluster: DrainCluster = { id: this.clusters.length + 1, tokens, size: 1 };
    this.clusters.push(cluster);
    leaf.clusters.push(cluster);
    return cluster;
  }

  private leafFor(tokens: string[]): Node {
    const lenKey = String(tokens.length);
    let node: Node | undefined = this.root.children.get(lenKey);
    if (!node) {
      node = { children: new Map(), clusters: [] };
      this.root.children.set(lenKey, node);
    }
    // depth - 2 token layers below the length layer
    const layers = Math.min(this.depth - 2, tokens.length);
    for (let i = 0; i < layers; i++) {
      let key = tokens[i];
      if (hasDigit(key) || key.startsWith('<')) key = WILDCARD;
      let next: Node | undefined = node.children.get(key);
      if (!next) {
        if (node.children.size >= this.maxChildren) {
          next = node.children.get(WILDCARD);
          if (!next) {
            next = { children: new Map(), clusters: [] };
            node.children.set(WILDCARD, next);
          }
        } else {
          next = { children: new Map(), clusters: [] };
          node.children.set(key, next);
        }
      }
      node = next;
    }
    return node;
  }
}

function similarity(template: string[], tokens: string[]): [number, number] {
  if (template.length !== tokens.length || tokens.length === 0) return [tokens.length === 0 && template.length === 0 ? 1 : 0, 0];
  let same = 0;
  let params = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (template[i] === WILDCARD) { params++; continue; }
    if (template[i] === tokens[i]) same++;
  }
  return [same / tokens.length, params];
}

function merge(template: string[], tokens: string[]): string[] {
  return template.map((t, i) => (t === tokens[i] ? t : WILDCARD));
}

export function templateText(c: DrainCluster): string {
  return c.tokens.join(' ');
}
