// SPDX-License-Identifier: MIT
/**
 * Module resolution per language.
 *
 * JS/TS: relative specifiers with ESM `./x.js` → `./x.ts` mapping, index
 * files, tsconfig/jsconfig `paths` + `baseUrl` (with `extends`), and
 * workspace packages through their package.json `exports`/`main` (falling
 * back from `dist/` to `src/` when the package is not built).
 * Python: package-aware module index, relative imports, submodule imports.
 * Go: go.mod module path → package directory. Java: package + class index.
 * Rust: `mod x;` file modules and `crate::`/`self::`/`super::` paths.
 */

import { readFileSync, statSync, readdirSync } from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';
import { parseJsonc } from '../core/jsonc.js';
import { normalizeKey } from '../core/git.js';
import { languageForFile, isWithin } from '../core/paths.js';
import type { ImportRecord } from '../parsing/modules.js';
import type { ParsedFile } from './pipeline.js';

export type Resolution =
  | { kind: 'file'; abs: string; viaPackage?: string }
  | { kind: 'external'; pkg: string }
  | { kind: 'builtin'; name: string }
  | { kind: 'asset'; abs: string }
  | { kind: 'unresolved' };

const JS_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];
const JS_EXT_SWAP: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

interface TsPaths {
  baseUrl: string | null;
  pathsBase: string;
  paths: Array<{ pattern: string; targets: string[] }>;
}

interface WorkspacePackage {
  name: string;
  dir: string;
  manifest: any;
}

export class Resolver {
  private statCache = new Map<string, 'file' | 'dir' | null>();
  private tsconfigCache = new Map<string, TsPaths | null>();
  private pkgJsonCache = new Map<string, string | null>();
  private workspace = new Map<string, WorkspacePackage>();
  private pyIndex = new Map<string, string>();
  private goModules: Array<{ dir: string; module: string }> = [];
  private javaIndex = new Map<string, string>();
  private javaPackages = new Map<string, string[]>();
  private known = new Map<string, string>();

  constructor(
    readonly root: string,
    parsed: ParsedFile[]
  ) {
    for (const p of parsed) this.known.set(normalizeKey(p.file.abs), p.file.abs);
    this.discoverPackages(parsed);
    this.buildPythonIndex(parsed);
    this.buildJavaIndex(parsed);
  }

  /** Canonical absolute path of an analysed file, or null. */
  knownFile(abs: string): string | null {
    return this.known.get(normalizeKey(abs)) ?? null;
  }

  workspacePackages(): WorkspacePackage[] {
    return [...this.workspace.values()];
  }

  private stat(p: string): 'file' | 'dir' | null {
    let v = this.statCache.get(p);
    if (v === undefined) {
      try {
        const s = statSync(p);
        v = s.isFile() ? 'file' : s.isDirectory() ? 'dir' : null;
      } catch {
        v = null;
      }
      this.statCache.set(p, v);
    }
    return v;
  }

  /** Nearest package.json directory at or above `dir` (bounded by the filesystem root). */
  nearestPackageDir(dir: string): string | null {
    const hit = this.pkgJsonCache.get(dir);
    if (hit !== undefined) return hit;
    let result: string | null = null;
    if (this.stat(path.join(dir, 'package.json')) === 'file') result = dir;
    else {
      const parent = path.dirname(dir);
      result = parent !== dir && isWithin(parent, this.root) ? this.nearestPackageDir(parent) : null;
    }
    this.pkgJsonCache.set(dir, result);
    return result;
  }

  private discoverPackages(parsed: ParsedFile[]): void {
    const dirs = new Set<string>();
    for (const p of parsed) {
      if (p.file.lang === 'go') {
        let d = path.dirname(p.file.abs);
        while (isWithin(d, this.root)) {
          if (this.stat(path.join(d, 'go.mod')) === 'file') {
            if (!this.goModules.some((m) => m.dir === d)) {
              const text = readFileSync(path.join(d, 'go.mod'), 'utf-8');
              const m = text.match(/^module\s+(\S+)/m);
              if (m) this.goModules.push({ dir: d, module: m[1] });
            }
            break;
          }
          const parent = path.dirname(d);
          if (parent === d) break;
          d = parent;
        }
      }
      const pkg = this.nearestPackageDir(path.dirname(p.file.abs));
      if (pkg) dirs.add(pkg);
    }
    // Workspace roots can declare packages that contain no analysed file yet.
    for (const d of dirs) {
      try {
        const manifest = JSON.parse(readFileSync(path.join(d, 'package.json'), 'utf-8'));
        if (typeof manifest.name === 'string') this.workspace.set(manifest.name, { name: manifest.name, dir: d, manifest });
      } catch {
        /* unreadable package.json: not a workspace package */
      }
    }
    this.goModules.sort((a, b) => b.dir.length - a.dir.length);
  }

  // ── JS / TS ───────────────────────────────────────────────────────────────

  private loadTsconfig(file: string, depth = 0): TsPaths | null {
    if (depth > 5) return null;
    let json: any;
    try {
      json = parseJsonc(readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
    const dir = path.dirname(file);
    let base: TsPaths = { baseUrl: null, pathsBase: dir, paths: [] };
    const ext = json.extends;
    for (const e of Array.isArray(ext) ? ext : ext ? [ext] : []) {
      if (typeof e !== 'string') continue;
      let target: string | null = null;
      if (e.startsWith('.') || path.isAbsolute(e)) {
        target = path.resolve(dir, e);
        if (!target.endsWith('.json')) target += this.stat(target) === 'file' ? '' : '.json';
      } else {
        const inNm = path.join(dir, 'node_modules', e);
        target = this.stat(inNm) === 'file' ? inNm : this.stat(inNm + '.json') === 'file' ? inNm + '.json' : path.join(inNm, 'tsconfig.json');
      }
      if (target && this.stat(target) === 'file') {
        const parent = this.loadTsconfig(target, depth + 1);
        if (parent) base = parent;
      }
    }
    const co = json.compilerOptions ?? {};
    const out: TsPaths = { ...base };
    if (typeof co.baseUrl === 'string') {
      out.baseUrl = path.resolve(dir, co.baseUrl);
      out.pathsBase = out.baseUrl;
    }
    if (co.paths && typeof co.paths === 'object') {
      out.paths = Object.entries(co.paths)
        .filter(([, v]) => Array.isArray(v))
        .map(([pattern, targets]) => ({ pattern, targets: (targets as unknown[]).filter((t): t is string => typeof t === 'string') }));
      if (!out.baseUrl) out.pathsBase = dir;
    }
    return out;
  }

  private tsconfigFor(dir: string): TsPaths | null {
    const hit = this.tsconfigCache.get(dir);
    if (hit !== undefined) return hit;
    let result: TsPaths | null = null;
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const f = path.join(dir, name);
      if (this.stat(f) === 'file') {
        result = this.loadTsconfig(f);
        break;
      }
    }
    if (!result) {
      const parent = path.dirname(dir);
      result = parent !== dir && isWithin(parent, this.root) ? this.tsconfigFor(parent) : null;
    }
    this.tsconfigCache.set(dir, result);
    return result;
  }

  private jsFile(base: string): Resolution | null {
    const st = this.stat(base);
    if (st === 'file') {
      return languageForFile(base) ? { kind: 'file', abs: base } : { kind: 'asset', abs: base };
    }
    const ext = path.extname(base);
    const swap = JS_EXT_SWAP[ext];
    if (swap) {
      const stem = base.slice(0, -ext.length);
      for (const e of swap) if (this.stat(stem + e) === 'file') return { kind: 'file', abs: stem + e };
    }
    for (const e of JS_EXTS) if (this.stat(base + e) === 'file') return { kind: 'file', abs: base + e };
    if (st === 'dir') {
      const pj = path.join(base, 'package.json');
      if (this.stat(pj) === 'file') {
        try {
          const m = JSON.parse(readFileSync(pj, 'utf-8'));
          for (const f of [m.source, m.module, m.main, m.types]) {
            if (typeof f === 'string') {
              const r = this.jsFile(path.resolve(base, f));
              if (r) return r;
            }
          }
        } catch {
          /* ignore */
        }
      }
      for (const e of JS_EXTS) {
        const idx = path.join(base, 'index' + e);
        if (this.stat(idx) === 'file') return { kind: 'file', abs: idx };
      }
    }
    return null;
  }

  /** Map an unbuilt package's `dist/x.js` target back to `src/x.ts`. */
  distToSource(pkgDir: string, target: string): Resolution | null {
    const direct = this.jsFile(path.resolve(pkgDir, target));
    if (direct) return direct;
    const swapped = target.replace(/^\.?\/?(dist|lib|build|out|esm|cjs)\//, 'src/').replace(/\.d\.[cm]?ts$/, '').replace(/\.[cm]?js$/, '');
    return this.jsFile(path.resolve(pkgDir, swapped));
  }

  private exportsTarget(exp: any, subpath: string): string | null {
    const conditions = ['source', 'development', 'import', 'module', 'require', 'node', 'types', 'default'];
    const pick = (v: any): string | null => {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = pick(x);
          if (r) return r;
        }
        return null;
      }
      if (v && typeof v === 'object') {
        for (const c of conditions) if (c in v) {
          const r = pick(v[c]);
          if (r) return r;
        }
      }
      return null;
    };
    if (typeof exp === 'string' || Array.isArray(exp)) return subpath === '.' ? pick(exp) : null;
    if (!exp || typeof exp !== 'object') return null;
    const keys = Object.keys(exp);
    if (!keys.some((k) => k.startsWith('.'))) return subpath === '.' ? pick(exp) : null;
    if (subpath in exp) return pick(exp[subpath]);
    for (const k of keys) {
      const star = k.indexOf('*');
      if (star < 0) continue;
      const pre = k.slice(0, star);
      const post = k.slice(star + 1);
      if (subpath.startsWith(pre) && subpath.endsWith(post) && subpath.length >= pre.length + post.length) {
        const mid = subpath.slice(pre.length, subpath.length - post.length);
        const t = pick(exp[k]);
        if (t) return t.replace(/\*/g, mid);
      }
    }
    return null;
  }

  resolveJs(fromAbs: string, spec: string): Resolution {
    if (NODE_BUILTINS.has(spec) || spec.startsWith('node:') || spec.startsWith('bun:')) return { kind: 'builtin', name: spec };
    const clean = spec.split('?')[0].split('#')[0];
    if (clean.startsWith('.') || clean.startsWith('/')) {
      return this.jsFile(path.resolve(path.dirname(fromAbs), clean)) ?? { kind: 'unresolved' };
    }
    const ts = this.tsconfigFor(path.dirname(fromAbs));
    if (ts) {
      for (const { pattern, targets } of ts.paths) {
        const star = pattern.indexOf('*');
        let mid: string | null = null;
        if (star < 0) mid = pattern === clean ? '' : null;
        else {
          const pre = pattern.slice(0, star);
          const post = pattern.slice(star + 1);
          if (clean.startsWith(pre) && clean.endsWith(post) && clean.length >= pre.length + post.length) mid = clean.slice(pre.length, clean.length - post.length);
        }
        if (mid === null) continue;
        for (const t of targets) {
          // tsconfig allows one `*` per target; split/join substitutes it literally
          // (no `$&` replacement patterns) and every occurrence if there were more.
          const r = this.jsFile(path.resolve(ts.pathsBase, t.split('*').join(mid)));
          if (r) return r;
        }
      }
      if (ts.baseUrl) {
        const r = this.jsFile(path.resolve(ts.baseUrl, clean));
        if (r) return r;
      }
    }
    const parts = clean.split('/');
    const pkgName = clean.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const ws = this.workspace.get(pkgName);
    if (ws) {
      const r = this.resolveWorkspace(ws, clean, pkgName);
      return r.kind === 'file' ? { ...r, viaPackage: pkgName } : r;
    }
    if (clean.startsWith('~/') || clean.startsWith('@/') || clean.startsWith('#')) return { kind: 'unresolved' };
    return { kind: 'external', pkg: pkgName };
  }

  private resolveWorkspace(ws: WorkspacePackage, clean: string, pkgName: string): Resolution {
    const rest = clean.slice(pkgName.length);
    const subpath = rest ? '.' + rest : '.';
    const m = ws.manifest;
    if (m.exports !== undefined) {
      const t = this.exportsTarget(m.exports, subpath);
      if (t) {
        const r = this.distToSource(ws.dir, t);
        if (r) return r;
      }
    }
    if (subpath === '.') {
      for (const f of [m.source, m.module, m.main, m.types, 'src/index', 'index']) {
        if (typeof f === 'string') {
          const r = this.distToSource(ws.dir, f);
          if (r) return r;
        }
      }
    } else {
      const r = this.jsFile(path.resolve(ws.dir, rest.slice(1))) ?? this.jsFile(path.resolve(ws.dir, 'src', rest.slice(1)));
      if (r) return r;
    }
    return { kind: 'unresolved' };
  }

  // ── Python ───────────────────────────────────────────────────────────────

  private buildPythonIndex(parsed: ParsedFile[]): void {
    const isPkg = (d: string) => this.stat(path.join(d, '__init__.py')) === 'file';
    for (const p of parsed) {
      if (p.file.lang !== 'python') continue;
      const abs = p.file.abs;
      const stem = path.basename(abs).replace(/\.pyi?$/, '');
      let dir = path.dirname(abs);
      const parts = stem === '__init__' ? [] : [stem];
      while (isPkg(dir) && isWithin(path.dirname(dir), this.root)) {
        parts.unshift(path.basename(dir));
        dir = path.dirname(dir);
      }
      const add = (name: string) => {
        if (name && !this.pyIndex.has(name)) this.pyIndex.set(name, abs);
      };
      add(parts.join('.'));
      // Also relative to the repo root and to a src/ layout.
      for (const base of [this.root, path.join(this.root, 'src')]) {
        if (isWithin(abs, base)) {
          const rel = path.relative(base, abs).replace(/\.pyi?$/, '').split(path.sep);
          if (rel[rel.length - 1] === '__init__') rel.pop();
          add(rel.join('.'));
        }
      }
    }
  }

  private pyModuleFile(dir: string, parts: string[]): string | null {
    const base = path.join(dir, ...parts);
    for (const c of [base + '.py', base + '.pyi', path.join(base, '__init__.py')]) {
      if (this.stat(c) === 'file') return c;
    }
    return null;
  }

  /** All files an import statement pulls in (a from-import can name submodules). */
  resolvePython(fromAbs: string, imp: ImportRecord): Resolution[] {
    const mod = imp.specifier;
    const parts = mod ? mod.split('.') : [];
    const out: Resolution[] = [];
    if (imp.level && imp.level > 0) {
      let dir = path.dirname(fromAbs);
      for (let i = 1; i < imp.level; i++) dir = path.dirname(dir);
      const target = parts.length ? this.pyModuleFile(dir, parts) : this.pyModuleFile(dir, []) ?? path.join(dir, '__init__.py');
      if (target && this.stat(target) === 'file') out.push({ kind: 'file', abs: target });
      for (const n of imp.names) {
        if (n.imported === '*') continue;
        const sub = this.pyModuleFile(dir, [...parts, n.imported]);
        if (sub) out.push({ kind: 'file', abs: sub });
      }
      return out.length ? out : [{ kind: 'unresolved' }];
    }
    const hit = this.pyIndex.get(mod);
    if (hit) out.push({ kind: 'file', abs: hit });
    for (const n of imp.names) {
      if (n.imported === '*' || !mod) continue;
      const sub = this.pyIndex.get(`${mod}.${n.imported}`);
      if (sub) out.push({ kind: 'file', abs: sub });
    }
    if (!out.length) {
      // `import a.b.c` where only `a.b` is ours, e.g. attribute access.
      for (let i = parts.length - 1; i > 0 && !out.length; i--) {
        const h = this.pyIndex.get(parts.slice(0, i).join('.'));
        if (h) out.push({ kind: 'file', abs: h });
      }
    }
    if (!out.length) out.push({ kind: 'external', pkg: parts[0] ?? mod });
    return out;
  }

  // ── Go ───────────────────────────────────────────────────────────────────

  resolveGo(spec: string): Resolution[] {
    for (const m of this.goModules) {
      if (spec === m.module || spec.startsWith(m.module + '/')) {
        const dir = path.join(m.dir, spec.slice(m.module.length));
        let entries: string[] = [];
        try {
          entries = readdirSync(dir).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
        } catch {
          return [{ kind: 'unresolved' }];
        }
        const files = entries.map((f) => path.join(dir, f));
        return files.length ? files.map((abs) => ({ kind: 'file' as const, abs })) : [{ kind: 'unresolved' }];
      }
    }
    const first = spec.split('/')[0];
    if (!first.includes('.')) return [{ kind: 'builtin', name: spec }];
    return [{ kind: 'external', pkg: spec.split('/').slice(0, 3).join('/') }];
  }

  // ── Java ─────────────────────────────────────────────────────────────────

  private buildJavaIndex(parsed: ParsedFile[]): void {
    for (const p of parsed) {
      if (p.file.lang !== 'java' || !p.module?.packageName) continue;
      const cls = path.basename(p.file.abs, '.java');
      this.javaIndex.set(`${p.module.packageName}.${cls}`, p.file.abs);
      const list = this.javaPackages.get(p.module.packageName) ?? [];
      list.push(p.file.abs);
      this.javaPackages.set(p.module.packageName, list);
    }
  }

  resolveJava(imp: ImportRecord): Resolution[] {
    const spec = imp.specifier;
    if (imp.wildcard) {
      const files = this.javaPackages.get(spec) ?? (this.javaIndex.get(spec) ? [this.javaIndex.get(spec)!] : null);
      if (files) return files.map((abs) => ({ kind: 'file' as const, abs }));
    } else {
      const segs = spec.split('.');
      for (let i = segs.length; i > 1; i--) {
        const hit = this.javaIndex.get(segs.slice(0, i).join('.'));
        if (hit) return [{ kind: 'file', abs: hit }];
      }
    }
    if (/^(java|javax|jdk|sun|com\.sun)\./.test(spec)) return [{ kind: 'builtin', name: spec }];
    return [{ kind: 'external', pkg: spec.split('.').slice(0, 3).join('.') }];
  }

  // ── Rust ─────────────────────────────────────────────────────────────────

  private rustFileModule(dir: string, segs: string[]): string | null {
    for (let i = segs.length; i >= 1; i--) {
      const base = path.join(dir, ...segs.slice(0, i));
      if (this.stat(base + '.rs') === 'file') return base + '.rs';
      if (this.stat(path.join(base, 'mod.rs')) === 'file') return path.join(base, 'mod.rs');
    }
    return null;
  }

  /** Directory holding the children of the module defined by `file`. */
  private rustModuleDir(file: string): string {
    const b = path.basename(file);
    return b === 'mod.rs' || b === 'lib.rs' || b === 'main.rs' ? path.dirname(file) : path.join(path.dirname(file), b.replace(/\.rs$/, ''));
  }

  private rustCrateSrc(file: string): string | null {
    let d = path.dirname(file);
    while (isWithin(d, this.root)) {
      if (this.stat(path.join(d, 'Cargo.toml')) === 'file') return path.join(d, 'src');
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
    return null;
  }

  resolveRustMod(fromAbs: string, name: string): Resolution {
    const r = this.rustFileModule(this.rustModuleDir(fromAbs), [name]);
    return r ? { kind: 'file', abs: r } : { kind: 'unresolved' };
  }

  resolveRustUse(fromAbs: string, spec: string): Resolution {
    const segs = spec.split('::').filter(Boolean);
    const head = segs[0];
    let dir: string | null = null;
    let rest = segs.slice(1);
    if (head === 'crate') dir = this.rustCrateSrc(fromAbs);
    else if (head === 'self') dir = this.rustModuleDir(fromAbs);
    else if (head === 'super') {
      dir = path.dirname(this.rustModuleDir(fromAbs));
      while (rest[0] === 'super') {
        dir = path.dirname(dir);
        rest = rest.slice(1);
      }
    } else if (['std', 'core', 'alloc', 'proc_macro', 'test'].includes(head)) return { kind: 'builtin', name: head };
    else {
      // A sibling module referenced without `crate::` (2018 edition in-crate path).
      const local = this.rustFileModule(this.rustModuleDir(fromAbs), segs);
      if (local) return { kind: 'file', abs: local };
      const crateLocal = this.rustCrateSrc(fromAbs);
      const top = crateLocal ? this.rustFileModule(crateLocal, segs) : null;
      if (top) return { kind: 'file', abs: top };
      return { kind: 'external', pkg: head };
    }
    if (!dir) return { kind: 'unresolved' };
    if (!rest.length) return { kind: 'unresolved' };
    const r = this.rustFileModule(dir, rest);
    if (r) return { kind: 'file', abs: r };
    // `use crate::Thing` naming an item of the crate root itself.
    for (const rootFile of ['lib.rs', 'main.rs', 'mod.rs']) {
      const f = path.join(dir, rootFile);
      if (this.stat(f) === 'file') return { kind: 'file', abs: f };
    }
    return { kind: 'unresolved' };
  }
}
