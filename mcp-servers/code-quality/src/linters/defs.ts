// SPDX-License-Identifier: MIT
/**
 * Linter / formatter / type-checker definitions.
 *
 * Each runs ONCE per project (grouped by its project marker), in that
 * project's directory so its own configuration is found, preferring the
 * project's locally installed binary. Tools that need a config to be
 * meaningful only run when one is found.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isWithin, type LanguageId } from '../core/paths.js';
import { resolveNative, resolveNodeBin, type ResolutionFailure, type ResolvedCommand } from '../core/binaries.js';
import { parseJsonc } from '../core/jsonc.js';
import {
  parseCargo,
  parseCheckstyle,
  parseDotnetFormat,
  parseEslint,
  parseGithubAnnotations,
  parseGolangci,
  parseMypy,
  parsePmd,
  parsePrettierList,
  parsePylint,
  parsePyright,
  parseRuff,
  parseRuffFormat,
  parseTsc,
  type RawDiagnostic,
} from './parsers.js';

export type LinterCategory = 'lint' | 'format' | 'types';

export interface RunContext {
  repoRoot: string;
  projectDir: string;
  /** Paths relative to projectDir (or '.'), already chunk-sized. */
  targets: string[];
  wholeProject: boolean;
  fix: boolean;
  changedSince?: string;
  config: string | null;
  /** Scratch directory for report files; removed by the runner. */
  tmpDir: string;
  version?: string;
}

export interface Invocation {
  args: string[];
  /** Read the report from this file instead of stdout. */
  reportFile?: string;
}

export interface LinterDef {
  id: string;
  category: LinterCategory;
  languages: LanguageId[];
  /** Directory the tool runs in for a file in `fileDir` (its project root). */
  projectDir(fileDir: string, repoRoot: string): string;
  requiresConfig: boolean;
  supportsFix: boolean;
  /** Timeout override. */
  timeoutMs?: number;
  /** Accepts a list of files (else runs on the whole project and output is filtered). */
  acceptsFiles: boolean;
  findConfig(projectDir: string, repoRoot: string): string | null;
  resolve(projectDir: string, repoRoot: string): ResolvedCommand | ResolutionFailure;
  /** Optional version probe args (e.g. to pick golangci-lint v1 vs v2 flags). */
  versionArgs?: string[];
  invocation(ctx: RunContext): Invocation;
  /** Exit code meaning "ran; findings may be present". */
  okExit(code: number): boolean;
  parse(stdout: string, stderr: string, ctx: RunContext): RawDiagnostic[];
}

function upward(start: string, stop: string, names: string[], test?: (file: string) => boolean): string | null {
  let dir = path.resolve(start);
  for (;;) {
    for (const n of names) {
      const f = path.join(dir, n);
      if (existsSync(f) && (!test || test(f))) return f;
    }
    if (path.resolve(dir) === path.resolve(stop)) return null;
    const parent = path.dirname(dir);
    if (parent === dir || !isWithin(parent, stop)) return null;
    dir = parent;
  }
}

/** Nearest ancestor of `start` (up to `stop`) containing one of `markers` (`*.ext` allowed); else `stop`. */
export function nearestMarkerDir(start: string, stop: string, markers: string[]): string {
  let dir = path.resolve(start);
  for (;;) {
    let entries: string[] | null = null;
    for (const m of markers) {
      if (m.startsWith('*')) {
        entries ??= safeReaddir(dir);
        if (entries.some((e) => e.endsWith(m.slice(1)))) return dir;
      } else if (existsSync(path.join(dir, m))) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (path.resolve(dir) === path.resolve(stop) || parent === dir || !isWithin(parent, stop)) return path.resolve(stop);
    dir = parent;
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const codes = (...c: number[]) => (code: number) => c.includes(code);

function fileHas(re: RegExp): (f: string) => boolean {
  return (f) => {
    try {
      return re.test(readFileSync(f, 'utf-8'));
    } catch {
      return false;
    }
  };
}

function packageJsonKey(key: string): (f: string) => boolean {
  return (f) => {
    try {
      return JSON.parse(readFileSync(f, 'utf-8'))[key] !== undefined;
    } catch {
      return false;
    }
  };
}

const JS: LanguageId[] = ['javascript', 'typescript', 'tsx'];

const ESLINT_FLAT = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts'];
const ESLINT_LEGACY = ['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc'];

export const eslint: LinterDef = {
  id: 'eslint',
  category: 'lint',
  languages: JS,
  projectDir: (d, r) => nearestMarkerDir(d, r, ['package.json']),
  requiresConfig: true,
  supportsFix: true,
  acceptsFiles: true,
  findConfig: (dir, root) =>
    upward(dir, root, ESLINT_FLAT) ?? upward(dir, root, ESLINT_LEGACY) ?? upward(dir, root, ['package.json'], packageJsonKey('eslintConfig')),
  resolve: (dir) => resolveNodeBin('eslint', 'eslint', dir),
  invocation: (ctx) => {
    const legacy = ctx.config !== null && !ESLINT_FLAT.includes(path.basename(ctx.config));
    return {
      args: [
        '--format', 'json', '--no-error-on-unmatched-pattern',
        ...(legacy ? ['--ext', '.js,.jsx,.mjs,.cjs,.ts,.tsx,.mts,.cts'] : []),
        ...(ctx.fix ? ['--fix'] : []),
        ...ctx.targets,
      ],
    };
  },
  okExit: codes(0, 1),
  parse: (stdout) => parseEslint(stdout),
};

export const biome: LinterDef = {
  id: 'biome',
  category: 'lint',
  languages: JS,
  projectDir: (d, r) => nearestMarkerDir(d, r, ['package.json']),
  requiresConfig: true,
  supportsFix: true,
  acceptsFiles: true,
  findConfig: (dir, root) => upward(dir, root, ['biome.json', 'biome.jsonc']),
  resolve: (dir) => resolveNodeBin('@biomejs/biome', 'biome', dir),
  invocation: (ctx) => ({
    args: ['check', '--reporter=github', '--no-errors-on-unmatched', ...(ctx.fix ? ['--write'] : []), ...ctx.targets],
  }),
  okExit: codes(0, 1),
  parse: (stdout, stderr) => parseGithubAnnotations(stdout + '\n' + stderr, 'biome'),
};

const PRETTIER_CONFIGS = [
  '.prettierrc', '.prettierrc.json', '.prettierrc.json5', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.toml',
  '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.ts', 'prettier.config.js', 'prettier.config.cjs',
  'prettier.config.mjs', 'prettier.config.ts',
];

export const prettier: LinterDef = {
  id: 'prettier',
  category: 'format',
  languages: JS,
  projectDir: (d, r) => nearestMarkerDir(d, r, ['package.json']),
  requiresConfig: true,
  supportsFix: true,
  acceptsFiles: true,
  findConfig: (dir, root) => upward(dir, root, PRETTIER_CONFIGS) ?? upward(dir, root, ['package.json'], packageJsonKey('prettier')),
  resolve: (dir) => resolveNodeBin('prettier', 'prettier', dir),
  invocation: (ctx) => ({
    args: ['--list-different', '--no-error-on-unmatched-pattern', ...(ctx.fix ? ['--write'] : []), ...ctx.targets],
  }),
  okExit: codes(0, 1),
  parse: (stdout, _stderr, ctx) => parsePrettierList(stdout, ctx.fix),
};

/** Solution-style tsconfig (`files: []` + `references`) → the referenced projects. */
export function tsconfigProjects(tsconfig: string): string[] {
  try {
    const json = parseJsonc(readFileSync(tsconfig, 'utf-8'));
    const refs: string[] = (json.references ?? []).map((r: { path: string }) => r.path).filter((p: unknown) => typeof p === 'string');
    const isSolution = Array.isArray(json.files) && json.files.length === 0 && !json.include && refs.length > 0;
    if (!isSolution) return [tsconfig];
    return refs
      .map((r) => {
        const abs = path.resolve(path.dirname(tsconfig), r);
        return abs.endsWith('.json') ? abs : path.join(abs, 'tsconfig.json');
      })
      .filter((p) => existsSync(p));
  } catch {
    return [tsconfig];
  }
}

export const tsc: LinterDef = {
  id: 'tsc',
  category: 'types',
  languages: ['typescript', 'tsx'],
  projectDir: (d, r) => nearestMarkerDir(d, r, ['tsconfig.json']),
  requiresConfig: true,
  supportsFix: false,
  acceptsFiles: false,
  timeoutMs: 600_000,
  findConfig: (dir) => (existsSync(path.join(dir, 'tsconfig.json')) ? path.join(dir, 'tsconfig.json') : null),
  resolve: (dir) => resolveNodeBin('typescript', 'tsc', dir),
  invocation: (ctx) => ({ args: ['--noEmit', '--pretty', 'false', '-p', ctx.targets[0]] }),
  okExit: codes(0, 1, 2),
  parse: (stdout) => parseTsc(stdout),
};

const PY_MARKERS = ['pyproject.toml', 'setup.cfg', 'setup.py', 'ruff.toml', '.ruff.toml', 'requirements.txt', 'Pipfile', 'tox.ini'];

export const ruff: LinterDef = {
  id: 'ruff',
  category: 'lint',
  languages: ['python'],
  projectDir: (d, r) => nearestMarkerDir(d, r, PY_MARKERS),
  requiresConfig: false,
  supportsFix: true,
  acceptsFiles: true,
  findConfig: (dir, root) => upward(dir, root, ['ruff.toml', '.ruff.toml']) ?? upward(dir, root, ['pyproject.toml'], fileHas(/^\[tool\.ruff/m)),
  resolve: (dir, root) => resolveNative('ruff', dir, root),
  invocation: (ctx) => ({ args: ['check', '--output-format=json', '--no-cache', ...(ctx.fix ? ['--fix'] : []), ...ctx.targets] }),
  okExit: codes(0, 1),
  parse: (stdout) => parseRuff(stdout),
};

export const ruffFormat: LinterDef = {
  id: 'ruff-format',
  category: 'format',
  languages: ['python'],
  projectDir: (d, r) => nearestMarkerDir(d, r, PY_MARKERS),
  requiresConfig: true,
  supportsFix: true,
  acceptsFiles: true,
  findConfig: (dir, root) =>
    upward(dir, root, ['ruff.toml', '.ruff.toml'], fileHas(/^\[format\]/m)) ?? upward(dir, root, ['pyproject.toml'], fileHas(/^\[tool\.ruff\.format\]/m)),
  resolve: (dir, root) => resolveNative('ruff', dir, root),
  invocation: (ctx) => ({ args: ['format', '--no-cache', ...(ctx.fix ? [] : ['--check']), ...ctx.targets] }),
  okExit: codes(0, 1),
  parse: (stdout, stderr) => parseRuffFormat(stdout + '\n' + stderr),
};

export const pylint: LinterDef = {
  id: 'pylint',
  category: 'lint',
  languages: ['python'],
  projectDir: (d, r) => nearestMarkerDir(d, r, PY_MARKERS),
  requiresConfig: true,
  supportsFix: false,
  acceptsFiles: true,
  findConfig: (dir, root) =>
    upward(dir, root, ['.pylintrc', 'pylintrc']) ??
    upward(dir, root, ['pyproject.toml'], fileHas(/^\[tool\.pylint/m)) ??
    upward(dir, root, ['setup.cfg'], fileHas(/^\[pylint/m)),
  resolve: (dir, root) => resolveNative('pylint', dir, root),
  invocation: (ctx) => ({ args: ['--output-format=json', '--recursive=y', '--score=n', ...ctx.targets] }),
  // pylint's exit status is a bit mask of message categories; 32 = usage error.
  okExit: (code) => code >= 0 && code < 32,
  parse: (stdout) => parsePylint(stdout),
};

export const mypy: LinterDef = {
  id: 'mypy',
  category: 'types',
  languages: ['python'],
  projectDir: (d, r) => nearestMarkerDir(d, r, PY_MARKERS),
  requiresConfig: true,
  supportsFix: false,
  acceptsFiles: true,
  timeoutMs: 600_000,
  findConfig: (dir, root) =>
    upward(dir, root, ['mypy.ini', '.mypy.ini']) ??
    upward(dir, root, ['pyproject.toml'], fileHas(/^\[tool\.mypy/m)) ??
    upward(dir, root, ['setup.cfg'], fileHas(/^\[mypy/m)),
  resolve: (dir, root) => resolveNative('mypy', dir, root),
  invocation: (ctx) => ({
    args: [
      '--no-color-output', '--no-error-summary', '--show-column-numbers', '--show-error-codes', '--hide-error-context', '--no-pretty',
      '--cache-dir', path.join(os.tmpdir(), 'code-quality-mypy-cache'),
      ...ctx.targets,
    ],
  }),
  okExit: codes(0, 1),
  parse: (stdout) => parseMypy(stdout),
};

export const pyright: LinterDef = {
  id: 'pyright',
  category: 'types',
  languages: ['python'],
  projectDir: (d, r) => nearestMarkerDir(d, r, PY_MARKERS),
  requiresConfig: true,
  supportsFix: false,
  acceptsFiles: true,
  timeoutMs: 600_000,
  findConfig: (dir, root) => upward(dir, root, ['pyrightconfig.json']) ?? upward(dir, root, ['pyproject.toml'], fileHas(/^\[tool\.pyright/m)),
  resolve: (dir, root) => {
    const local = resolveNodeBin('pyright', 'pyright', dir);
    return 'command' in local ? local : resolveNative('pyright', dir, root);
  },
  invocation: (ctx) => ({ args: ['--outputjson', ...ctx.targets.filter((t) => t !== '.')] }),
  okExit: codes(0, 1),
  parse: (stdout) => parsePyright(stdout),
};

export const golangci: LinterDef = {
  id: 'golangci-lint',
  category: 'lint',
  languages: ['go'],
  projectDir: (d, r) => nearestMarkerDir(d, r, ['go.mod']),
  requiresConfig: false,
  supportsFix: true,
  acceptsFiles: true,
  timeoutMs: 600_000,
  findConfig: (dir, root) => upward(dir, root, ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json']),
  resolve: (dir, root) => resolveNative('golangci-lint', dir, root),
  versionArgs: ['version'],
  invocation: (ctx) => {
    const v2 = /(^|\D)2\.\d+/.test(ctx.version ?? '') && !/version v?1\./.test(ctx.version ?? '');
    const pkgs = ctx.wholeProject
      ? ['./...']
      : [...new Set(ctx.targets.map((t) => (t === '.' ? './...' : t.endsWith('.go') ? `./${path.posix.dirname(t)}` : `./${t}/...`)))];
    const report = path.join(ctx.tmpDir, 'golangci.json');
    const common = [...(ctx.fix ? ['--fix'] : []), ...(ctx.changedSince ? [`--new-from-rev=${ctx.changedSince}`] : [])];
    if (v2) {
      return { args: ['run', `--output.json.path=${report}`, '--show-stats=false', ...common, ...pkgs], reportFile: report };
    }
    return { args: ['run', '--out-format=json', '--issues-exit-code=1', ...common, ...pkgs] };
  },
  okExit: codes(0, 1),
  parse: (stdout) => parseGolangci(stdout),
};

function isCargoWorkspace(f: string): boolean {
  return fileHas(/^\[workspace\]/m)(f);
}

export const clippy: LinterDef = {
  id: 'clippy',
  category: 'lint',
  languages: ['rust'],
  projectDir: (d, r) => {
    // A crate inside a Cargo workspace is checked once, from the workspace root.
    let dir = nearestMarkerDir(d, r, ['Cargo.toml']);
    for (let up = path.dirname(dir); isWithin(up, r) && up !== dir; up = path.dirname(up)) {
      const f = path.join(up, 'Cargo.toml');
      if (existsSync(f) && isCargoWorkspace(f)) dir = up;
      if (path.resolve(up) === path.resolve(r)) break;
    }
    return dir;
  },
  requiresConfig: false,
  supportsFix: true,
  acceptsFiles: false,
  timeoutMs: 900_000,
  findConfig: (dir, root) => upward(dir, root, ['clippy.toml', '.clippy.toml']),
  resolve: (dir, root) => resolveNative('cargo', dir, root),
  versionArgs: ['clippy', '--version'],
  invocation: (ctx) => ({
    args: ['clippy', '--message-format=json', '--quiet', '--all-targets', ...(ctx.fix ? ['--fix', '--allow-dirty', '--allow-staged'] : [])],
  }),
  okExit: codes(0, 101),
  parse: (stdout) => parseCargo(stdout),
};


const JAVA_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];

export const checkstyle: LinterDef = {
  id: 'checkstyle',
  category: 'lint',
  languages: ['java'],
  projectDir: (d, r) => nearestMarkerDir(d, r, JAVA_MARKERS),
  requiresConfig: true,
  supportsFix: false,
  acceptsFiles: true,
  findConfig: (dir, root) =>
    upward(dir, root, ['checkstyle.xml', '.checkstyle.xml', 'checkstyle-config.xml', path.join('config', 'checkstyle', 'checkstyle.xml'), path.join('config', 'checkstyle.xml')]),
  resolve: (dir, root) => {
    const jar = process.env.CHECKSTYLE_JAR;
    if (jar) {
      if (!existsSync(jar)) return { reason: `CHECKSTYLE_JAR points to a missing file: ${jar}` };
      const java = resolveNative('java', dir, root);
      return 'command' in java ? { ...java, prefix: ['-jar', jar], source: `${jar} (CHECKSTYLE_JAR)` } : java;
    }
    return resolveNative('checkstyle', dir, root);
  },
  invocation: (ctx) => ({ args: ['-c', ctx.config!, '-f', 'xml', ...ctx.targets] }),
  okExit: (code) => code >= 0, // exit status = number of errors
  parse: (stdout) => parseCheckstyle(stdout),
};

function findPmdRuleset(dir: string, root: string): string | null {
  const direct = upward(dir, root, ['pmd.xml', 'pmd-ruleset.xml', 'pmd-rules.xml', 'ruleset.xml', path.join('.pmd', 'ruleset.xml')]);
  if (direct) return direct;
  for (const base of [dir, root]) {
    const cfg = path.join(base, 'config', 'pmd');
    try {
      const xml = readdirSync(cfg).find((f) => f.endsWith('.xml'));
      if (xml) return path.join(cfg, xml);
    } catch {
      /* none */
    }
  }
  return null;
}

export const pmd: LinterDef = {
  id: 'pmd',
  category: 'lint',
  languages: ['java'],
  projectDir: (d, r) => nearestMarkerDir(d, r, JAVA_MARKERS),
  requiresConfig: true,
  supportsFix: false,
  acceptsFiles: true,
  findConfig: findPmdRuleset,
  resolve: (dir, root) => resolveNative('pmd', dir, root),
  versionArgs: ['--version'],
  invocation: (ctx) => {
    const pmd7 = !/PMD 6\./i.test(ctx.version ?? '');
    const targets = ctx.targets.join(',');
    return pmd7
      ? { args: ['check', '-d', targets, '-R', ctx.config!, '-f', 'json', '--no-progress', '--no-fail-on-violation'] }
      : { args: ['-d', targets, '-R', ctx.config!, '-f', 'json', '-failOnViolation', 'false'] };
  },
  okExit: codes(0, 4),
  parse: (stdout) => parsePmd(stdout),
};

function findDotnetProject(dir: string): string | null {
  try {
    const entries = readdirSync(dir);
    const sln = entries.find((f) => f.endsWith('.sln') || f.endsWith('.slnx'));
    if (sln) return path.join(dir, sln);
    const proj = entries.find((f) => f.endsWith('.csproj'));
    return proj ? path.join(dir, proj) : null;
  } catch {
    return null;
  }
}

export const dotnetFormat: LinterDef = {
  id: 'dotnet-format',
  category: 'format',
  languages: ['csharp'],
  projectDir: (d, r) => {
    const sln = nearestMarkerDir(d, r, ['*.sln', '*.slnx']);
    return findDotnetProject(sln)?.match(/\.slnx?$/) ? sln : nearestMarkerDir(d, r, ['*.csproj']);
  },
  requiresConfig: true,
  supportsFix: true,
  acceptsFiles: true,
  timeoutMs: 900_000,
  findConfig: (dir) => findDotnetProject(dir),
  resolve: (dir, root) => resolveNative('dotnet', dir, root),
  invocation: (ctx) => ({
    args: [
      'format', ctx.config!, ...(ctx.fix ? [] : ['--verify-no-changes']), '--report', ctx.tmpDir, '--verbosity', 'quiet',
      ...(ctx.wholeProject ? [] : ['--include', ...ctx.targets]),
    ],
    reportFile: path.join(ctx.tmpDir, 'format-report.json'),
  }),
  okExit: codes(0, 2),
  parse: (stdout) => parseDotnetFormat(stdout),
};

export const ALL_LINTERS: LinterDef[] = [eslint, biome, prettier, tsc, ruff, ruffFormat, pylint, mypy, pyright, golangci, clippy, checkstyle, pmd, dotnetFormat];

export function linterById(id: string): LinterDef | undefined {
  return ALL_LINTERS.find((l) => l.id === id);
}
