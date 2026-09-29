// SPDX-License-Identifier: MIT
/**
 * analyze_import_graph — resolved import graph with cycles, orphans,
 * fan-in/out, unresolved imports and architecture boundary rules.
 */

import * as path from 'path';
import { isChanged, type ScopeOptions } from '../core/files.js';
import { relPath } from '../core/paths.js';
import { bound, mdTable, notesSection, round, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse } from '../analysis/pipeline.js';
import { buildGraph, cyclePath, stronglyConnected, type ImportGraph } from '../analysis/graph.js';
import { checkBoundaries, type BoundaryConfig, type Dependency } from '../analysis/boundaries.js';

export interface ImportGraphInput extends ScopeOptions {
  maxDepth?: number;
  excludeNodeModules?: boolean;
  ignoreTypeImports?: boolean;
  rules?: BoundaryConfig;
  focus?: string;
  limit?: number;
}

function depthLevels(g: ImportGraph, maxDepth: number): Map<string, number> {
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const [abs, list] of g.in) {
    if (list.filter((e) => !e.structural).length === 0) {
      level.set(abs, 0);
      queue.push(abs);
    }
  }
  while (queue.length) {
    const n = queue.shift()!;
    const d = level.get(n)!;
    if (d >= maxDepth) continue;
    for (const e of g.out.get(n) ?? []) {
      if (!level.has(e.to)) {
        level.set(e.to, d + 1);
        queue.push(e.to);
      }
    }
  }
  return level;
}

function reach(g: ImportGraph, start: string, dir: 'out' | 'in', maxDepth: number): Set<string> {
  const seen = new Set<string>();
  let frontier = [start];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const e of (dir === 'out' ? g.out.get(n) : g.in.get(n)) ?? []) {
        const other = dir === 'out' ? e.to : e.from;
        if (other !== start && !seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

export async function analyzeImportGraph(input: ImportGraphInput): Promise<ToolResult> {
  const limit = input.limit ?? 30;
  const maxDepth = input.maxDepth ?? 10;
  const run = await runParse(input, { magicNumbers: false, modules: true, onlyChanged: false });
  const root = run.scope.root;
  const rel = (abs: string) => relPath(root, abs);
  const g = buildGraph(run.parsed, root);
  const changed = (abs: string) => isChanged(run.scope, abs);

  const sccOpts = { ignoreTypeOnly: input.ignoreTypeImports ?? false };
  const sccs = stronglyConnected(g, sccOpts);
  const inCycle = new Map<string, number>();
  sccs.forEach((c, i) => c.forEach((f) => inCycle.set(f, i)));
  const cycles = sccs
    .filter((c) => c.some(changed))
    .map((c) => ({ size: c.length, files: c.map(rel).sort(), path: cyclePath(g, c, sccOpts).map(rel) }))
    .sort((a, b) => b.size - a.size);

  let internalEdges = 0;
  const stats = [...g.files.keys()].map((abs) => {
    const outE = (g.out.get(abs) ?? []).filter((e) => !e.structural);
    const inE = (g.in.get(abs) ?? []).filter((e) => !e.structural);
    internalEdges += outE.length;
    const ce = new Set(outE.map((e) => e.to)).size;
    const ca = new Set(inE.map((e) => e.from)).size;
    return { file: rel(abs), abs, fanIn: ca, fanOut: ce, instability: ca + ce ? round(ce / (ca + ce)) : 0 };
  });
  const orphans = stats.filter((s) => s.fanIn === 0 && s.fanOut === 0 && (g.in.get(s.abs) ?? []).length === 0 && changed(s.abs)).map((s) => s.file);
  const levels = depthLevels(g, maxDepth);
  const depth = Math.max(0, ...levels.values());

  const extCounts = new Map<string, number>();
  for (const e of g.externals) extCounts.set(e.pkg, (extCounts.get(e.pkg) ?? 0) + 1);
  const externals = [...extCounts.entries()].sort((a, b) => b[1] - a[1]).map(([pkg, count]) => ({ pkg, count }));
  const unresolved = g.unresolved.filter((u) => changed(u.from)).map((u) => ({ file: rel(u.from), line: u.line, specifier: u.specifier }));

  let violations: ReturnType<typeof checkBoundaries> = [];
  if (input.rules && ((input.rules.forbidden?.length ?? 0) + (input.rules.allowed?.length ?? 0)) > 0) {
    const deps: Dependency[] = [];
    for (const [abs, list] of g.out) {
      if (!changed(abs)) continue;
      for (const e of list) {
        if (e.structural) continue;
        const ci = inCycle.get(e.from);
        deps.push({ from: rel(e.from), to: rel(e.to), external: false, circular: ci !== undefined && ci === inCycle.get(e.to), typeOnly: e.typeOnly, line: e.line });
      }
    }
    for (const x of g.externals) {
      if (changed(x.from)) deps.push({ from: rel(x.from), to: x.pkg, external: true, circular: false, typeOnly: x.typeOnly, line: x.line });
    }
    violations = checkBoundaries(input.rules, deps);
  }

  let focus: unknown = undefined;
  if (input.focus) {
    const fabs = path.isAbsolute(input.focus) ? path.resolve(input.focus) : path.resolve(root, input.focus);
    const key = g.resolver.knownFile(fabs);
    if (!key) throw new Error(`focus: ${input.focus} is not among the analysed files`);
    const deps = reach(g, key, 'out', maxDepth);
    const dependents = reach(g, key, 'in', maxDepth);
    focus = {
      file: rel(key),
      imports: [...new Set((g.out.get(key) ?? []).map((e) => rel(e.to)))].sort(),
      importedBy: [...new Set((g.in.get(key) ?? []).map((e) => rel(e.from)))].sort(),
      externalPackages: [...new Set(g.externals.filter((e) => e.from === key).map((e) => e.pkg))].sort(),
      transitiveDependencies: deps.size,
      transitiveDependents: dependents.size,
      inCycle: inCycle.has(key),
    };
  }

  const bc = bound(cycles, limit);
  const bv = bound(violations, limit);
  const bo = bound(orphans, limit);
  const bu = bound(unresolved, limit);
  const topIn = [...stats].sort((a, b) => b.fanIn - a.fanIn).slice(0, 10).filter((s) => s.fanIn > 0);
  const topOut = [...stats].sort((a, b) => b.fanOut - a.fanOut).slice(0, 10).filter((s) => s.fanOut > 0);
  const notes = [...run.notes];
  if (g.unsupportedLanguages.length) notes.push(`No file-level resolution for: ${g.unsupportedLanguages.join(', ')}.`);
  if (g.outsideScope) notes.push(`${g.outsideScope} import(s) resolve to files outside the analysed path (analyse the repo root to include them).`);

  const summary = {
    files: g.files.size,
    internalEdges,
    externalPackages: externals.length,
    builtinImports: g.builtinImports,
    unresolvedImports: unresolved.length,
    cycles: cycles.length,
    filesInCycles: cycles.reduce((s, c) => s + c.size, 0),
    orphans: orphans.length,
    maxDepth: depth,
    violations: violations.length,
  };
  const data = {
    root,
    summary,
    cycles: bc.items,
    violations: bv.items,
    mostImported: topIn.map(({ abs: _a, ...s }) => s),
    mostDependent: topOut.map(({ abs: _a, ...s }) => s),
    orphans: bo.items,
    unresolved: bu.items,
    externals: input.excludeNodeModules === false ? externals : externals.slice(0, 20),
    focus,
    truncated: bc.truncated || bv.truncated || bo.truncated || bu.truncated,
    notes,
  };

  const md: string[] = ['# Import graph', '', `Root: \`${root}\``, ''];
  md.push(`- Files ${summary.files} · internal imports ${summary.internalEdges} · external packages ${summary.externalPackages} · max depth ${summary.maxDepth}`);
  md.push(`- Cycles **${summary.cycles}** (${summary.filesInCycles} files) · orphans ${summary.orphans} · unresolved imports ${summary.unresolvedImports}${input.rules ? ` · boundary violations **${summary.violations}**` : ''}`);
  md.push('');
  if (focus) {
    const f = focus as { file: string; imports: string[]; importedBy: string[]; externalPackages: string[]; transitiveDependencies: number; transitiveDependents: number; inCycle: boolean };
    md.push(`## Focus: ${f.file}`, '');
    md.push(`- Imports (${f.imports.length}): ${f.imports.slice(0, limit).join(', ') || '—'}`);
    md.push(`- Imported by (${f.importedBy.length}): ${f.importedBy.slice(0, limit).join(', ') || '—'}`);
    md.push(`- External packages: ${f.externalPackages.join(', ') || '—'}`);
    md.push(`- Transitive dependencies ${f.transitiveDependencies} · transitive dependents ${f.transitiveDependents}${f.inCycle ? ' · **part of a cycle**' : ''}`, '');
  }
  if (bv.items.length) {
    md.push('## Boundary violations', '');
    md.push(mdTable(['Severity', 'Rule', 'From', 'To'], bv.items.map((v) => [v.severity, v.rule, `${v.from}:${v.line}`, v.to])));
    md.push(truncatedLine(bv, 'violations'));
  }
  if (bc.items.length) {
    md.push('## Circular dependencies', '');
    bc.items.forEach((c, i) => md.push(`${i + 1}. (${c.size} files) ${c.path.join(' → ')}`));
    md.push(truncatedLine(bc, 'cycles'));
  }
  if (topIn.length) {
    md.push('', '## Most imported (fan-in)', '');
    md.push(mdTable(['File', 'Fan-in', 'Fan-out', 'Instability'], topIn.map((s) => [s.file, s.fanIn, s.fanOut, s.instability])));
  }
  if (topOut.length) {
    md.push('', '## Most dependent (fan-out)', '');
    md.push(mdTable(['File', 'Fan-out', 'Fan-in', 'Instability'], topOut.map((s) => [s.file, s.fanOut, s.fanIn, s.instability])));
  }
  if (bu.items.length) {
    md.push('', '## Unresolved imports', '');
    for (const u of bu.items) md.push(`- ${u.file}:${u.line} \`${u.specifier}\``);
    md.push(truncatedLine(bu, 'unresolved imports'));
  }
  if (bo.items.length) {
    md.push('', '## Orphan files (no internal imports either way)', '');
    md.push(bo.items.map((o) => `- ${o}`).join('\n'));
    md.push(truncatedLine(bo, 'orphans'));
  }
  if (externals.length) {
    md.push('', '## External packages', '');
    md.push(externals.slice(0, input.excludeNodeModules === false ? externals.length : 20).map((e) => `${e.pkg} (${e.count})`).join(', '));
  }
  md.push(notesSection(notes));
  return { data, markdown: md.join('\n') };
}
