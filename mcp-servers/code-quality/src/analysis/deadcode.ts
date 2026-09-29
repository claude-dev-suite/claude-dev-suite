// SPDX-License-Identifier: MIT
/**
 * Dead-code analysis on top of the resolved import graph.
 *
 * JS/TS (knip-like): unused files (unreachable from entry points), unused
 * exports (following named and `export *` re-exports), unused and unlisted
 * package dependencies. Python (vulture-like, best effort): unused imports,
 * unreferenced module-level definitions, modules nothing imports. All
 * languages: private functions whose name is never referenced in their
 * visibility domain.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { isJsLike, isTestFile, relPath } from '../core/paths.js';
import type { ImportGraph } from './graph.js';
import type { ParsedFile } from './pipeline.js';

export type DeadKind = 'file' | 'export' | 'type' | 'dependency' | 'unlisted' | 'import' | 'definition' | 'function';
export type Confidence = 'high' | 'medium' | 'low';

export interface DeadItem {
  kind: DeadKind;
  name: string;
  file: string;
  line: number;
  confidence: Confidence;
  reason: string;
}

export interface DeadCodeOptions {
  entries?: string[];
}

const ENTRY_NAME = /(^|\/)(index|main|app|server|cli|bin|worker|handler|lambda|setup|global-setup|middleware|instrumentation)\.[cm]?[jt]sx?$/;
const CONFIG_FILE = /(^|\/)[^/]*\.(config|conf|rc)\.[cm]?[jt]s$|(^|\/)(vite|vitest|jest|webpack|rollup|babel|next|nuxt|svelte|astro|tailwind|postcss|playwright|eslint|prettier|tsup|esbuild|drizzle|knip)\.[^/]*\.[cm]?[jt]s$/;
const ROUTE_DIR = /(^|\/)(pages|app|routes|api|src\/pages|src\/app|src\/routes)\//;
const STORY = /\.(stories|story)\.[cm]?[jt]sx?$/;

function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function stringLeaves(v: unknown, out: string[]): void {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringLeaves(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => stringLeaves(x, out));
}

function pkgNameOf(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Text of small config files at a package root, to spot tool plugins referenced by name. */
function configTexts(dir: string): string {
  let text = '';
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return '';
  }
  for (const name of entries) {
    if (!/config|^\.[a-z]|rc$|rc\.|\.toml$|\.ya?ml$|^Dockerfile|^Makefile/i.test(name) || name === 'package-lock.json' || name === 'node_modules') continue;
    const f = path.join(dir, name);
    try {
      const st = statSync(f);
      if (st.isFile() && st.size < 200_000) text += '\n' + readFileSync(f, 'utf-8');
    } catch {
      /* ignore */
    }
  }
  return text;
}

export function analyzeDeadCode(g: ImportGraph, root: string, opts: DeadCodeOptions): { items: DeadItem[]; notes: string[] } {
  const items: DeadItem[] = [];
  const notes: string[] = [];
  const rel = (abs: string) => relPath(root, abs);
  const parsedList = [...g.files.values()];
  const jsFiles = parsedList.filter((p) => isJsLike(p.file.lang));

  // ── Entry points ────────────────────────────────────────────────────────
  const entries = new Set<string>();
  const addEntry = (abs: string | null | undefined) => {
    if (abs) {
      const k = g.resolver.knownFile(abs);
      if (k) entries.add(k);
    }
  };
  for (const ws of g.resolver.workspacePackages()) {
    const m = ws.manifest;
    const targets: string[] = [];
    for (const f of ['main', 'module', 'browser', 'types', 'typings', 'source']) if (typeof m[f] === 'string') targets.push(m[f]);
    stringLeaves(m.bin, targets);
    stringLeaves(m.exports, targets);
    for (const t of targets) {
      const r = g.resolver.distToSource(ws.dir, t.replace(/\*.*$/, ''));
      if (r?.kind === 'file') addEntry(r.abs);
      if (t.includes('*')) {
        const prefix = path.resolve(ws.dir, t.slice(0, t.indexOf('*')).replace(/^(\.\/)?(dist|lib|build|out)\//, 'src/'));
        for (const p of jsFiles) if (p.file.abs.startsWith(prefix)) entries.add(p.file.abs);
      }
    }
    for (const script of Object.values(m.scripts ?? {})) {
      if (typeof script !== 'string') continue;
      for (const tok of script.split(/[\s"'=]+/)) {
        if (/\.[cm]?[jt]sx?$/.test(tok) && !tok.startsWith('-')) addEntry(path.resolve(ws.dir, tok));
      }
    }
  }
  for (const p of parsedList) {
    const r = p.file.rel;
    if (
      p.file.isTest || STORY.test(r) || CONFIG_FILE.test(r) || ROUTE_DIR.test(r) ||
      /(^|\/)(scripts|bin|tools|e2e|cypress)\//.test(r) || p.file.content.startsWith('#!') ||
      (ENTRY_NAME.test(r) && (r.split('/').length <= 2 || /(^|\/)(src|lib|app)\/[^/]+$/.test(r)))
    ) {
      entries.add(p.file.abs);
    }
  }
  if (opts.entries?.length) {
    for (const p of parsedList) if (opts.entries.some((gl) => minimatch(p.file.rel, gl, { dot: true }))) entries.add(p.file.abs);
  }

  // ── Unused files (JS/TS) ────────────────────────────────────────────────
  const jsEntries = [...entries].filter((e) => isJsLike(g.files.get(e)?.file.lang ?? null));
  const reachable = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const n = stack.pop()!;
    if (reachable.has(n)) continue;
    reachable.add(n);
    for (const e of g.out.get(n) ?? []) if (!reachable.has(e.to)) stack.push(e.to);
  }
  if (jsFiles.length && jsEntries.length === 0) {
    notes.push('No JS/TS entry points found (package.json main/exports/bin, index/main files, configs, tests): unused-file detection skipped. Pass `entries`.');
  } else {
    for (const p of jsFiles) {
      if (reachable.has(p.file.abs)) continue;
      items.push({
        kind: 'file', name: p.file.rel, file: p.file.rel, line: 1, confidence: 'medium',
        reason: 'not reachable from any entry point through static or dynamic imports',
      });
    }
  }

  // ── Unused exports (JS/TS) ──────────────────────────────────────────────
  const used = new Map<string, Set<string>>(); // file → names used ('*' = all)
  const markVisited = new Set<string>();
  const mark = (file: string, name: string) => {
    const key = `${file}\0${name}`;
    if (markVisited.has(key)) return;
    markVisited.add(key);
    let s = used.get(file);
    if (!s) used.set(file, (s = new Set()));
    s.add(name);
    const m = g.files.get(file)?.module;
    if (!m) return;
    const own = new Set(m.exports.map((e) => e.name));
    for (const e of g.out.get(file) ?? []) {
      if (!e.reexport) continue;
      for (const b of e.names) {
        // b.imported = name in the source module, b.local = name exported here.
        if (b.imported === '*' && b.local === '*') {
          if (name === '*' || (!own.has(name) && name !== 'default')) mark(e.to, name);
        } else if (b.imported === '*') {
          if (name === '*' || name === b.local) mark(e.to, '*'); // export * as ns
        } else if (name === '*' || name === b.local) {
          mark(e.to, b.imported);
        }
      }
    }
  };
  for (const list of g.out.values()) {
    for (const e of list) {
      if (e.reexport) continue;
      if (!e.names.length) continue; // side-effect import
      for (const b of e.names) mark(e.to, b.imported);
    }
  }
  for (const p of jsFiles) {
    const m = p.module;
    if (!m || m.commonJs || entries.has(p.file.abs) || !reachable.has(p.file.abs)) continue;
    const u = used.get(p.file.abs);
    if (u?.has('*')) continue;
    const idents = p.analysis.identifiers;
    for (const ex of m.exports) {
      if (u?.has(ex.name)) continue;
      const localUses = ex.name !== 'default' ? (idents?.get(ex.name) ?? 0) - 1 : 0;
      items.push({
        kind: ex.typeOnly ? 'type' : 'export',
        name: ex.name,
        file: p.file.rel,
        line: ex.line,
        confidence: ex.name === 'default' || localUses > 0 ? 'low' : 'medium',
        reason: localUses > 0 ? 'exported but only used inside its own file (the export is unnecessary)' : 'exported but never imported by an analysed file',
      });
    }
  }

  // ── Dependencies (JS/TS) ────────────────────────────────────────────────
  const packages = g.resolver.workspacePackages();
  const pkgDirs = new Map(packages.map((p) => [p.dir, p]));
  const rootPkg = existsSync(path.join(root, 'package.json')) && !pkgDirs.has(root) ? readJson(path.join(root, 'package.json')) : null;
  if (rootPkg) pkgDirs.set(root, { name: rootPkg.name ?? '(root)', dir: root, manifest: rootPkg });
  const usedByPkg = new Map<string, Map<string, { file: string; line: number }>>();
  for (const x of [...g.externals, ...g.workspaceImports.map((w) => ({ ...w, line: 1 }))]) {
    const p = g.files.get(x.from);
    if (!p || !isJsLike(p.file.lang)) continue;
    const dir = g.resolver.nearestPackageDir(path.dirname(x.from));
    if (!dir) continue;
    let m = usedByPkg.get(dir);
    if (!m) usedByPkg.set(dir, (m = new Map()));
    if (!m.has(x.pkg)) m.set(x.pkg, { file: rel(x.from), line: x.line });
  }
  const declaredIn = (dir: string): Set<string> => {
    const m = pkgDirs.get(dir)?.manifest ?? readJson(path.join(dir, 'package.json')) ?? {};
    return new Set(
      ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(m[k] ?? {}))
    );
  };
  const workspaceNames = new Set(packages.map((p) => p.name));
  if (jsFiles.length) {
    for (const [dir, ws] of pkgDirs) {
      const m = ws.manifest;
      const usedHere = new Set<string>();
      for (const [d, set] of usedByPkg) if (d === dir || d.startsWith(dir + path.sep)) for (const k of set.keys()) usedHere.add(k);
      const scripts = Object.values(m.scripts ?? {}).filter((s): s is string => typeof s === 'string').join('\n');
      const configs = configTexts(dir);
      let tsTypes: string[] = [];
      try {
        const tsText = readFileSync(path.join(dir, 'tsconfig.json'), 'utf-8');
        tsTypes = [...tsText.matchAll(/"types"\s*:\s*\[([^\]]*)\]/g)].flatMap((mm) => [...mm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
      } catch {
        /* no tsconfig */
      }
      for (const [field, conf] of [['dependencies', 'medium'], ['devDependencies', 'low'], ['optionalDependencies', 'low']] as const) {
        for (const dep of Object.keys(m[field] ?? {})) {
          if (usedHere.has(dep)) continue;
          if (dep.startsWith('@types/')) {
            const base = dep.slice(7);
            const real = base.includes('__') ? '@' + base.replace('__', '/') : base;
            if (usedHere.has(real) || base === 'node' || tsTypes.includes(base) || declaredIn(dir).has(real)) continue;
          }
          const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const short = dep.replace(/^@[^/]+\//, '').replace(/^(eslint-plugin-|eslint-config-|prettier-plugin-|babel-plugin-|@?vitejs\/plugin-)/, '');
          const inText = (t: string) => new RegExp(`(^|[^\\w@/-])${escaped}($|[^\\w-])`).test(t) || (short.length > 3 && t.includes(short));
          if (inText(scripts) || inText(configs)) continue;
          const binNames: string[] = [];
          const depManifest = readJson(path.join(dir, 'node_modules', dep, 'package.json')) ?? readJson(path.join(root, 'node_modules', dep, 'package.json'));
          if (depManifest?.bin) binNames.push(...(typeof depManifest.bin === 'string' ? [dep.replace(/^@[^/]+\//, '')] : Object.keys(depManifest.bin)));
          if (binNames.some((b) => new RegExp(`(^|[\\s;&|(])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`, 'm').test(scripts))) continue;
          items.push({
            kind: 'dependency', name: dep, file: relPath(root, path.join(dir, 'package.json')), line: 1, confidence: conf,
            reason: `declared in ${field} but not imported, nor referenced by scripts or config files`,
          });
        }
      }
    }
    // Unlisted: imported but declared nowhere up the package chain.
    for (const [dir, set] of usedByPkg) {
      for (const [pkg, where] of set) {
        let declared = false;
        let d: string | null = dir;
        while (d && !declared) {
          if (declaredIn(d).has(pkg) || pkgDirs.get(d)?.name === pkg) declared = true;
          const parent = path.dirname(d);
          d = parent !== d && (parent === root || parent.startsWith(root)) ? parent : null;
        }
        if (declared) continue;
        items.push({
          kind: 'unlisted', name: pkg, file: where.file, line: where.line, confidence: workspaceNames.has(pkg) ? 'medium' : 'high',
          reason: 'imported but not declared in any package.json up the tree',
        });
      }
    }
  }

  // ── Python ──────────────────────────────────────────────────────────────
  const pyFiles = parsedList.filter((p) => p.file.lang === 'python');
  if (pyFiles.length) {
    const total = new Map<string, number>();
    for (const p of pyFiles) for (const [k, v] of p.analysis.identifiers ?? []) total.set(k, (total.get(k) ?? 0) + v);
    for (const p of pyFiles) {
      const m = p.module;
      if (!m) continue;
      const idents = p.analysis.identifiers ?? new Map();
      const content = p.file.content;
      const allMatch = content.match(/__all__\s*[:=][^\n]*(\[[\s\S]*?\]|\([\s\S]*?\))/);
      const exported = new Set(allMatch ? [...allMatch[1].matchAll(/['"]([\w.]+)['"]/g)].map((x) => x[1]) : []);
      const isInit = /(^|\/)__init__\.py$/.test(p.file.rel);
      if (!isInit) {
        for (const imp of m.imports) {
          if (imp.specifier === '__future__') continue;
          for (const b of imp.names) {
            if (b.local === '*' || exported.has(b.local)) continue;
            const local = b.local.split('.')[0];
            const count = idents.get(local) ?? 0;
            if (count > 1) continue; // the import statement itself names it once
            if (new RegExp(`['"][^'"\\n]*\\b${local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(content)) continue; // string annotation
            items.push({
              kind: 'import', name: b.local, file: p.file.rel, line: imp.line, confidence: 'high',
              reason: 'imported but never referenced in this module',
            });
          }
        }
      }
      for (const d of m.definitions) {
        if (d.name.startsWith('__') || exported.has(d.name) || /^test/i.test(d.name) || p.file.isTest) continue;
        if ((total.get(d.name) ?? 0) > 1) continue;
        items.push({
          kind: 'definition', name: d.name, file: p.file.rel, line: d.line, confidence: 'medium',
          reason: `module-level ${d.kind} never referenced anywhere in the analysed Python code`,
        });
      }
      const importedBy = (g.in.get(p.file.abs) ?? []).length;
      const entryLike =
        isInit || p.file.isTest || entries.has(p.file.abs) || /__name__\s*==\s*['"]__main__['"]/.test(content) ||
        /(^|\/)(__main__|main|manage|setup|conftest|app|wsgi|asgi|cli|settings|noxfile|fabfile|tasks)\.py$/.test(p.file.rel) ||
        /(^|\/)(migrations|alembic)\//.test(p.file.rel);
      if (!importedBy && !entryLike) {
        items.push({
          kind: 'file', name: p.file.rel, file: p.file.rel, line: 1, confidence: 'low',
          reason: 'no analysed module imports it and it has no __main__ guard (may be loaded by a framework or entry point)',
        });
      }
    }
  }

  // ── Private functions never referenced (all languages) ──────────────────
  const domainIdents = new Map<string, Map<string, number>>();
  const domainOf = (p: ParsedFile): string => {
    switch (p.file.lang) {
      case 'go':
        return 'go:' + path.dirname(p.file.abs);
      case 'rust':
        return 'rust:' + (g.resolver.nearestPackageDir(path.dirname(p.file.abs)) ?? root);
      default:
        return 'file:' + p.file.abs;
    }
  };
  for (const p of parsedList) {
    const key = domainOf(p);
    let m = domainIdents.get(key);
    if (!m) domainIdents.set(key, (m = new Map()));
    for (const [k, v] of p.analysis.identifiers ?? []) m.set(k, (m.get(k) ?? 0) + v);
  }
  for (const p of parsedList) {
    if (p.file.isTest) continue;
    const ids = domainIdents.get(domainOf(p))!;
    for (const f of p.analysis.functions) {
      if (!f.isPrivate || f.decorated || f.anonymous) continue;
      const nm = f.simpleName;
      if (/^(main|init|new|drop|fmt|default|constructor|__\w+__|<.*)$/.test(nm) || /^test/i.test(nm)) continue;
      if (f.className && /\(impl /.test(f.className)) continue; // trait impls are called through the trait
      if (p.file.lang === 'python' && p.module?.definitions.some((d) => d.name === nm)) continue; // handled above
      if ((ids.get(nm) ?? 0) > 1) continue;
      items.push({
        kind: 'function', name: f.name, file: p.file.rel, line: f.line, confidence: 'medium',
        reason: `private ${p.file.lang === 'go' ? '(unexported) ' : ''}function never referenced in its ${p.file.lang === 'go' ? 'package' : p.file.lang === 'rust' ? 'crate' : 'file'}`,
      });
    }
  }
  if (!parsedList.some((p) => isTestFile(p.file.rel))) {
    notes.push('No test files were analysed; code used only by tests may be reported as unused.');
  }
  return { items, notes };
}
