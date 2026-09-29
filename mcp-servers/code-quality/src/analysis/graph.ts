// SPDX-License-Identifier: MIT
/**
 * File-level import graph, cycle detection (Tarjan SCC) and graph metrics.
 */

import type { ImportBinding } from '../parsing/modules.js';
import type { ParsedFile } from './pipeline.js';
import { Resolver, type Resolution } from './resolve.js';

export interface Edge {
  from: string;
  to: string;
  specifier: string;
  line: number;
  typeOnly: boolean;
  dynamic: boolean;
  reexport: boolean;
  /** Rust `mod x;` containment: a structural edge, excluded from cycles. */
  structural: boolean;
  names: ImportBinding[];
}

export interface ExternalUse {
  from: string;
  pkg: string;
  specifier: string;
  line: number;
  typeOnly: boolean;
}

export interface ImportGraph {
  files: Map<string, ParsedFile>;
  out: Map<string, Edge[]>;
  in: Map<string, Edge[]>;
  externals: ExternalUse[];
  /** Imports of workspace packages (resolved to their source files). */
  workspaceImports: Array<{ from: string; pkg: string }>;
  unresolved: Array<{ from: string; specifier: string; line: number }>;
  builtinImports: number;
  outsideScope: number;
  resolver: Resolver;
  unsupportedLanguages: string[];
}

export function buildGraph(parsed: ParsedFile[], root: string): ImportGraph {
  const resolver = new Resolver(root, parsed);
  const files = new Map<string, ParsedFile>();
  for (const p of parsed) files.set(p.file.abs, p);
  const out = new Map<string, Edge[]>();
  const inn = new Map<string, Edge[]>();
  for (const abs of files.keys()) {
    out.set(abs, []);
    inn.set(abs, []);
  }
  const g: ImportGraph = {
    files, out, in: inn, externals: [], workspaceImports: [], unresolved: [], builtinImports: 0, outsideScope: 0, resolver, unsupportedLanguages: [],
  };
  const unsupported = new Set<string>();

  const add = (p: ParsedFile, r: Resolution, spec: string, line: number, extra: Partial<Edge>) => {
    switch (r.kind) {
      case 'file': {
        if (r.viaPackage) g.workspaceImports.push({ from: p.file.abs, pkg: r.viaPackage });
        const to = resolver.knownFile(r.abs);
        if (!to) {
          g.outsideScope++;
          return;
        }
        const e: Edge = {
          from: p.file.abs, to, specifier: spec, line,
          typeOnly: false, dynamic: false, reexport: false, structural: false, names: [], ...extra,
        };
        out.get(p.file.abs)!.push(e);
        inn.get(to)!.push(e);
        return;
      }
      case 'external':
        g.externals.push({ from: p.file.abs, pkg: r.pkg, specifier: spec, line, typeOnly: extra.typeOnly ?? false });
        return;
      case 'builtin':
        g.builtinImports++;
        return;
      case 'asset':
        return;
      default:
        g.unresolved.push({ from: p.file.abs, specifier: spec, line });
    }
  };

  for (const p of parsed) {
    const m = p.module;
    if (!m) continue;
    const lang = p.file.lang;
    if (lang === 'csharp') {
      if (m.imports.length) unsupported.add('C# (namespaces do not map to files)');
      continue;
    }
    for (const imp of m.imports) {
      const extra: Partial<Edge> = {
        typeOnly: imp.typeOnly,
        dynamic: imp.kind === 'dynamic' || imp.kind === 'require',
        names: imp.names,
      };
      if (lang === 'javascript' || lang === 'typescript' || lang === 'tsx') {
        add(p, resolver.resolveJs(p.file.abs, imp.specifier), imp.specifier, imp.line, extra);
      } else if (lang === 'python') {
        for (const r of resolver.resolvePython(p.file.abs, imp)) add(p, r, imp.specifier || '.'.repeat(imp.level ?? 0), imp.line, extra);
      } else if (lang === 'go') {
        for (const r of resolver.resolveGo(imp.specifier)) add(p, r, imp.specifier, imp.line, extra);
      } else if (lang === 'java') {
        for (const r of resolver.resolveJava(imp)) add(p, r, imp.specifier, imp.line, extra);
      } else if (lang === 'rust') {
        add(p, resolver.resolveRustUse(p.file.abs, imp.specifier), imp.specifier, imp.line, extra);
      }
    }
    for (const re of m.reexports) {
      add(p, resolver.resolveJs(p.file.abs, re.specifier), re.specifier, re.line, {
        reexport: true,
        names: re.names ? re.names.map((n) => ({ imported: n.imported, local: n.exported })) : [{ imported: '*', local: '*' }],
      });
    }
    for (const mod of m.modDecls) {
      add(p, resolver.resolveRustMod(p.file.abs, mod), `mod ${mod}`, 1, { structural: true });
    }
  }
  // De-duplicate identical from→to edges from the same statement kind.
  for (const [k, list] of out) {
    const seen = new Set<string>();
    out.set(
      k,
      list.filter((e) => {
        const key = `${e.to}\0${e.line}\0${e.reexport}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    );
  }
  for (const list of inn.values()) list.length = 0;
  for (const list of out.values()) for (const e of list) inn.get(e.to)!.push(e);
  g.unsupportedLanguages = [...unsupported];
  return g;
}

export interface CycleOptions {
  ignoreTypeOnly?: boolean;
  ignoreDynamic?: boolean;
}

function usable(e: Edge, o: CycleOptions): boolean {
  if (e.structural) return false;
  if (o.ignoreTypeOnly && e.typeOnly) return false;
  if (o.ignoreDynamic && e.dynamic) return false;
  return true;
}

/** Strongly connected components with more than one file (or a self-import). Iterative Tarjan. */
export function stronglyConnected(g: ImportGraph, o: CycleOptions = {}): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  let counter = 0;
  const adj = new Map<string, string[]>();
  for (const [k, list] of g.out) adj.set(k, list.filter((e) => usable(e, o)).map((e) => e.to));

  for (const start of g.files.keys()) {
    if (index.has(start)) continue;
    const work: Array<{ node: string; i: number }> = [{ node: start, i: 0 }];
    index.set(start, counter);
    low.set(start, counter);
    counter++;
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const edges = adj.get(frame.node) ?? [];
      if (frame.i < edges.length) {
        const w = edges[frame.i++];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(w)!));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].node;
          low.set(parent, Math.min(low.get(parent)!, low.get(frame.node)!));
        }
        if (low.get(frame.node) === index.get(frame.node)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== frame.node);
          const selfLoop = comp.length === 1 && (adj.get(comp[0]) ?? []).includes(comp[0]);
          if (comp.length > 1 || selfLoop) result.push(comp);
        }
      }
    }
  }
  return result;
}

/** One concrete cycle through `start` inside its SCC (BFS back to start). */
export function cyclePath(g: ImportGraph, comp: string[], o: CycleOptions = {}): string[] {
  const members = new Set(comp);
  const start = [...comp].sort()[0];
  const prev = new Map<string, string>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const n = queue.shift()!;
    for (const e of g.out.get(n) ?? []) {
      if (!usable(e, o) || !members.has(e.to)) continue;
      if (e.to === start) {
        const pathOut = [start];
        let cur = n;
        const back: string[] = [];
        while (cur !== start) {
          back.push(cur);
          cur = prev.get(cur)!;
        }
        return [...pathOut, ...back.reverse(), start];
      }
      if (!seen.has(e.to)) {
        seen.add(e.to);
        prev.set(e.to, n);
        queue.push(e.to);
      }
    }
  }
  return [start, start];
}
