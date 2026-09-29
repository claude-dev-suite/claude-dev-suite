// SPDX-License-Identifier: MIT
/**
 * Locate a project's own tools without a shell and without `npx`.
 *
 * - Node tools: `node_modules/<pkg>/package.json#bin` → JS entry, executed as
 *   `process.execPath <entry>`. This is what makes ESLint/Biome/tsc work on
 *   Windows: spawning `npx.cmd` with `shell:false` fails with EINVAL on
 *   Node >= 18.20.2, and `npx` may download a package the project never
 *   installed.
 * - Native tools: project virtualenv first, then PATH. On Windows only real
 *   executables (.exe/.com) are accepted; a `.cmd`/`.bat` shim cannot be run
 *   without a shell, so it is reported instead of executed.
 */

import { existsSync, readFileSync, statSync, accessSync, constants } from 'fs';
import * as path from 'path';

export interface ResolvedCommand {
  command: string;
  /** Arguments placed before the tool's own arguments (the JS entry for node tools). */
  prefix: string[];
  /** Where it was found: a node_modules package, a venv, PATH… */
  source: string;
  version?: string;
}

export interface ResolutionFailure {
  reason: string;
}

export function isResolved(r: ResolvedCommand | ResolutionFailure): r is ResolvedCommand {
  return (r as ResolvedCommand).command !== undefined;
}

function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Walk from `startDir` to the filesystem root looking for node_modules/<pkg>. */
export function findNodePackage(pkg: string, startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...pkg.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveNodeBin(pkg: string, bin: string, startDir: string): ResolvedCommand | ResolutionFailure {
  const pkgDir = findNodePackage(pkg, startDir);
  if (pkgDir) {
    const manifest = readJson(path.join(pkgDir, 'package.json'));
    const binField = manifest?.bin;
    const rel = typeof binField === 'string' ? binField : binField?.[bin];
    if (rel) {
      const entry = path.resolve(pkgDir, rel);
      if (existsSync(entry)) {
        return { command: process.execPath, prefix: [entry], source: `${pkg}@${manifest.version} (local)`, version: manifest.version };
      }
    }
    return { reason: `${pkg} is installed at ${pkgDir} but its "${bin}" bin entry was not found` };
  }
  // Globally installed via npm: follow the shim to its JS entry.
  const onPath = findOnPath(bin);
  if (onPath.kind === 'exe' && process.platform !== 'win32') {
    return { command: onPath.path, prefix: [], source: `${onPath.path} (PATH)` };
  }
  if (onPath.kind === 'shim') {
    const entry = jsEntryFromCmdShim(onPath.path);
    if (entry) return { command: process.execPath, prefix: [entry], source: `${entry} (global)` };
  }
  return { reason: `${pkg} is not installed in this project (no node_modules/${pkg}) and "${bin}" is not on PATH` };
}

/** npm's Windows `.cmd` shims name the JS file they run relative to %dp0%. */
export function jsEntryFromCmdShim(shimPath: string): string | null {
  try {
    const text = readFileSync(shimPath, 'utf-8');
    const m = text.match(/"%(?:~)?dp0%\\?([^"]+?\.[cm]?js)"/i);
    if (!m) return null;
    const entry = path.resolve(path.dirname(shimPath), m[1].replace(/\\/g, path.sep));
    return existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

export type PathLookup = { kind: 'exe'; path: string } | { kind: 'shim'; path: string } | { kind: 'none' };

function isExecutable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (process.platform === 'win32') return true;
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Search `extraDirs` then PATH. On Windows prefer .exe/.com; report .cmd/.bat as a shim. */
export function findOnPath(name: string, extraDirs: string[] = []): PathLookup {
  const dirs = [...extraDirs, ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean)];
  let shim: string | null = null;
  for (const dir of dirs) {
    if (process.platform === 'win32') {
      for (const ext of ['.exe', '.com']) {
        const p = path.join(dir, name + ext);
        if (isExecutable(p)) return { kind: 'exe', path: p };
      }
      if (!shim) {
        for (const ext of ['.cmd', '.bat']) {
          const p = path.join(dir, name + ext);
          if (existsSync(p)) {
            shim = p;
            break;
          }
        }
      }
    } else {
      const p = path.join(dir, name);
      if (isExecutable(p)) return { kind: 'exe', path: p };
    }
  }
  return shim ? { kind: 'shim', path: shim } : { kind: 'none' };
}

/** Script/bin directories of a project-local virtualenv, nearest first. */
export function venvBinDirs(projectDir: string, stopDir: string): string[] {
  const out: string[] = [];
  let dir = path.resolve(projectDir);
  const stop = path.resolve(stopDir);
  for (;;) {
    for (const venv of ['.venv', 'venv', 'env']) {
      const bin = path.join(dir, venv, process.platform === 'win32' ? 'Scripts' : 'bin');
      if (existsSync(bin)) out.push(bin);
    }
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

export function resolveNative(name: string, projectDir: string, stopDir: string): ResolvedCommand | ResolutionFailure {
  const venvs = venvBinDirs(projectDir, stopDir);
  const found = findOnPath(name, venvs);
  if (found.kind === 'exe') {
    const inVenv = venvs.some((v) => found.path.startsWith(v));
    return { command: found.path, prefix: [], source: `${found.path}${inVenv ? ' (virtualenv)' : ' (PATH)'}` };
  }
  if (found.kind === 'shim') {
    return {
      reason: `only a ${path.extname(found.path)} shim was found (${found.path}); it cannot be run without a shell — install a native ${name} executable`,
    };
  }
  return { reason: `${name} is not installed (not in a project virtualenv or on PATH)` };
}
