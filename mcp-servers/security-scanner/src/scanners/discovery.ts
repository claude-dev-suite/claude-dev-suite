// SPDX-License-Identifier: MIT
/**
 * Recursive discovery of dependency manifests and lockfiles, so monorepos
 * (`frontend/package-lock.json` + `backend/pom.xml` + `svc/go.mod`) are seen
 * in full instead of only whatever sits in the root directory.
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import type { NotScanned } from '../types.js';
import { DEFAULT_SKIP_DIRS, type ExcludeMatcher } from '../utils/paths.js';

export type ManifestKind =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'pip-requirements'
  | 'poetry'
  | 'uv'
  | 'pipenv'
  | 'pyproject'
  | 'go'
  | 'cargo'
  | 'maven'
  | 'gradle'
  | 'nuget'
  | 'composer'
  | 'bundler';

export const KIND_ECOSYSTEM: Record<ManifestKind, string> = {
  npm: 'npm',
  yarn: 'npm',
  pnpm: 'npm',
  'pip-requirements': 'PyPI',
  poetry: 'PyPI',
  uv: 'PyPI',
  pipenv: 'PyPI',
  pyproject: 'PyPI',
  go: 'Go',
  cargo: 'crates.io',
  maven: 'Maven',
  gradle: 'Maven',
  nuget: 'NuGet',
  composer: 'Packagist',
  bundler: 'RubyGems',
};

export interface Manifest {
  /** Relative POSIX path from the scan root. */
  path: string;
  /** Absolute directory containing it. */
  dir: string;
  /** Absolute file path. */
  file: string;
  kind: ManifestKind;
  ecosystem: string;
}

export interface Discovery {
  manifests: Manifest[];
  /** Manifests found without a lockfile any engine can read. */
  gaps: NotScanned[];
  /** True when the directory walk hit its limit. */
  limited: boolean;
}

const MAX_DIRS = 20000;
const MAX_DEPTH = 12;

const JS_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'];

export function discoverManifests(root: string, isExcluded: ExcludeMatcher): Discovery {
  const manifests: Manifest[] = [];
  const gaps: NotScanned[] = [];
  let dirs = 0;
  let limited = false;

  const walk = (abs: string, rel: string, depth: number, ancestors: { jsLock: boolean; cargoLock: boolean }) => {
    if (dirs++ >= MAX_DIRS || depth > MAX_DEPTH) {
      limited = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    const relOf = (name: string) => (rel ? `${rel}/${name}` : name);
    const add = (name: string, kind: ManifestKind) => {
      const p = relOf(name);
      if (isExcluded(p)) return;
      manifests.push({ path: p, dir: abs, file: join(abs, name), kind, ecosystem: KIND_ECOSYSTEM[kind] });
    };
    const gap = (name: string, ecosystem: string, reason: string) => {
      const p = relOf(name);
      if (!isExcluded(p)) gaps.push({ path: p, ecosystem, reason });
    };

    // JavaScript
    if (files.has('package-lock.json')) add('package-lock.json', 'npm');
    else if (files.has('npm-shrinkwrap.json')) add('npm-shrinkwrap.json', 'npm');
    if (files.has('yarn.lock')) add('yarn.lock', 'yarn');
    if (files.has('pnpm-lock.yaml')) add('pnpm-lock.yaml', 'pnpm');
    const hasJsLock = JS_LOCKS.some((f) => files.has(f));
    if (files.has('package.json') && !hasJsLock && !ancestors.jsLock) {
      gap('package.json', 'npm', 'no lockfile (run `npm install --package-lock-only` or your package manager to create one)');
    }

    // Python
    for (const f of files) if (/^requirements[\w.-]*\.txt$/i.test(f)) add(f, 'pip-requirements');
    if (files.has('poetry.lock')) add('poetry.lock', 'poetry');
    if (files.has('uv.lock')) add('uv.lock', 'uv');
    if (files.has('Pipfile.lock')) add('Pipfile.lock', 'pipenv');
    else if (files.has('Pipfile')) gap('Pipfile', 'PyPI', 'no Pipfile.lock (run `pipenv lock`)');
    const pyLocked = files.has('poetry.lock') || files.has('uv.lock') || files.has('Pipfile.lock') || [...files].some((f) => /^requirements[\w.-]*\.txt$/i.test(f));
    if (files.has('pyproject.toml') && !pyLocked) add('pyproject.toml', 'pyproject');

    // Go / Rust
    if (files.has('go.mod')) add('go.mod', 'go');
    if (files.has('Cargo.lock')) add('Cargo.lock', 'cargo');
    else if (files.has('Cargo.toml') && !ancestors.cargoLock) gap('Cargo.toml', 'crates.io', 'no Cargo.lock (run `cargo generate-lockfile`)');

    // JVM
    if (files.has('pom.xml')) add('pom.xml', 'maven');
    if (files.has('gradle.lockfile')) add('gradle.lockfile', 'gradle');
    else if (files.has('build.gradle') || files.has('build.gradle.kts')) {
      gap(files.has('build.gradle') ? 'build.gradle' : 'build.gradle.kts', 'Maven', 'no gradle.lockfile (enable Gradle dependency locking and run `gradle dependencies --write-locks`)');
    }

    // .NET
    if (files.has('packages.lock.json')) add('packages.lock.json', 'nuget');
    if (files.has('packages.config')) add('packages.config', 'nuget');
    if (!files.has('packages.lock.json') && !files.has('packages.config')) {
      const proj = [...files].find((f) => /\.(cs|fs|vb)proj$/i.test(f));
      if (proj) gap(proj, 'NuGet', 'no packages.lock.json (set RestorePackagesWithLockFile=true and restore)');
    }

    // PHP / Ruby
    if (files.has('composer.lock')) add('composer.lock', 'composer');
    else if (files.has('composer.json')) gap('composer.json', 'Packagist', 'no composer.lock (run `composer update --lock`)');
    if (files.has('Gemfile.lock')) add('Gemfile.lock', 'bundler');
    else if (files.has('Gemfile')) gap('Gemfile', 'RubyGems', 'no Gemfile.lock (run `bundle lock`)');

    const nextAncestors = { jsLock: ancestors.jsLock || hasJsLock, cargoLock: ancestors.cargoLock || files.has('Cargo.lock') };
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (DEFAULT_SKIP_DIRS.has(e.name)) continue;
      const childRel = relOf(e.name);
      if (isExcluded(childRel)) continue;
      walk(join(abs, e.name), childRel, depth + 1, nextAncestors);
    }
  };

  walk(root, '', 0, { jsLock: false, cargoLock: false });
  return { manifests, gaps, limited };
}
