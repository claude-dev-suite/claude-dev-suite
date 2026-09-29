// SPDX-License-Identifier: MIT
/**
 * Run the project's own linters/type-checkers: once per (tool, project), in
 * the project directory, honouring `fix`, with every outcome reported as a
 * status (ran / not-installed / no-config / failed / timeout).
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isResolved } from '../core/binaries.js';
import type { Diagnostic } from '../core/diagnostics.js';
import { isChanged, type FileScope, type SourceFile } from '../core/files.js';
import { isWithin, relPath, toPosix } from '../core/paths.js';
import { runProcess } from '../core/process.js';
import { redact } from '../core/report.js';
import { mapLimit } from '../core/concurrency.js';
import { ALL_LINTERS, tsconfigProjects, type LinterCategory, type LinterDef, type RunContext } from './defs.js';
import { ParseFailure } from './parsers.js';

export type RunStatus = 'ran' | 'not-installed' | 'no-config' | 'failed' | 'timeout';

export interface LinterRun {
  tool: string;
  category: LinterCategory;
  /** Project directory, repo-relative ('.' = repo root). */
  project: string;
  status: RunStatus;
  message?: string;
  command?: string;
  config?: string;
  source?: string;
  issues: number;
  fixApplied?: boolean;
  durationMs: number;
}

export interface LintOutcome {
  runs: LinterRun[];
  diagnostics: Diagnostic[];
  toolVersions: Record<string, string | undefined>;
}

export interface LintOptions {
  scope: FileScope;
  categories: LinterCategory[];
  only?: string[];
  fix: boolean;
  changedSince?: string;
  timeoutMs?: number;
}

/** Command lines stay well under Windows' 32K limit. */
const MAX_ARGS_CHARS = 24_000;

function chunk(files: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const f of files) {
    if (cur.length && len + f.length + 1 > MAX_ARGS_CHARS) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(f);
    len += f.length + 1;
  }
  if (cur.length) out.push(cur);
  return out;
}

function display(cmd: string, prefix: string[], args: string[]): string {
  const bin = prefix.length ? path.basename(prefix[prefix.length - 1]) : path.basename(cmd);
  const shown = args.length > 12 ? [...args.slice(0, 12), `…(+${args.length - 12})`] : args;
  return [bin, ...shown].join(' ');
}

export async function runLinters(opts: LintOptions): Promise<LintOutcome> {
  const { scope } = opts;
  const root = scope.root;
  const linters = ALL_LINTERS.filter((l) => opts.categories.includes(l.category) && (!opts.only?.length || opts.only.includes(l.id)));
  const inTarget = (abs: string) => (scope.targetIsFile ? path.resolve(abs) === path.resolve(scope.target) : isWithin(abs, scope.target));
  const wanted = scope.files.filter((f) => isChanged(scope, f.abs));

  interface Job {
    def: LinterDef;
    projectDir: string;
    files: SourceFile[];
  }
  const jobs: Job[] = [];
  for (const def of linters) {
    const byProject = new Map<string, SourceFile[]>();
    for (const f of wanted) {
      if (!def.languages.includes(f.lang)) continue;
      const dir = def.projectDir(path.dirname(f.abs), root);
      const list = byProject.get(dir) ?? [];
      list.push(f);
      byProject.set(dir, list);
    }
    for (const [projectDir, files] of byProject) jobs.push({ def, projectDir, files });
  }

  const versions: Record<string, string | undefined> = {};
  const results = await mapLimit(jobs, 3, async (job): Promise<{ run: LinterRun; diags: Diagnostic[] }> => {
    const { def, projectDir, files } = job;
    const started = Date.now();
    const project = relPath(root, projectDir) || '.';
    const base = { tool: def.id, category: def.category, project, issues: 0 };
    const config = def.findConfig(projectDir, root);
    if (def.requiresConfig && !config) {
      return { run: { ...base, status: 'no-config', message: `no ${def.id} configuration found for this project; not run`, durationMs: 0 }, diags: [] };
    }
    const cmd = def.resolve(projectDir, root);
    if (!isResolved(cmd)) {
      return { run: { ...base, status: 'not-installed', message: cmd.reason, config: config ? relPath(root, config) : undefined, durationMs: 0 }, diags: [] };
    }
    if (def.id === 'clippy') {
      const probe = await runProcess(cmd.command, [...cmd.prefix, 'clippy', '--version'], { cwd: projectDir, timeoutMs: 60_000 });
      if (probe.code !== 0) {
        return { run: { ...base, status: 'not-installed', message: 'cargo is installed but clippy is not (rustup component add clippy)', durationMs: Date.now() - started }, diags: [] };
      }
      versions[def.id] = probe.stdout.trim();
    }
    let version: string | undefined;
    if (def.versionArgs && def.id !== 'clippy') {
      const v = await runProcess(cmd.command, [...cmd.prefix, ...def.versionArgs], { cwd: projectDir, timeoutMs: 60_000 });
      version = (v.stdout + v.stderr).trim().split(/\r?\n/)[0];
    }
    versions[def.id] ??= version ?? cmd.version;

    // What to pass: the whole project, a sub-directory, or explicit files.
    const wholeProject = !scope.changed && !scope.targetIsFile && isWithin(projectDir, scope.target);
    let targetSets: string[][];
    if (def.id === 'tsc') {
      targetSets = tsconfigProjects(config!).map((t) => [path.relative(projectDir, t) || 'tsconfig.json']);
    } else if (!def.acceptsFiles || wholeProject) {
      targetSets = [['.']];
    } else if (!scope.changed && !scope.targetIsFile) {
      targetSets = [[toPosix(path.relative(projectDir, scope.target)) || '.']];
    } else {
      targetSets = chunk(files.map((f) => toPosix(path.relative(projectDir, f.abs))));
    }

    const diags: Diagnostic[] = [];
    const commands: string[] = [];
    let status: RunStatus = 'ran';
    let message: string | undefined;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-quality-'));
    try {
      for (const targets of targetSets) {
        const ctx: RunContext = {
          repoRoot: root, projectDir, targets, wholeProject, fix: opts.fix && def.supportsFix,
          changedSince: opts.changedSince, config, tmpDir, version,
        };
        const inv = def.invocation(ctx);
        const args = [...cmd.prefix, ...inv.args];
        commands.push(display(cmd.command, cmd.prefix, inv.args));
        const r = await runProcess(cmd.command, args, { cwd: projectDir, timeoutMs: opts.timeoutMs ?? def.timeoutMs ?? 300_000 });
        if (r.spawnError) {
          status = 'failed';
          message = `could not start ${def.id}: ${r.spawnError}`;
          break;
        }
        if (r.timedOut) {
          status = 'timeout';
          message = `${def.id} did not finish within ${Math.round((opts.timeoutMs ?? def.timeoutMs ?? 300_000) / 1000)}s`;
          break;
        }
        if (r.truncated) {
          status = 'failed';
          message = `${def.id} output exceeded the capture limit; narrow the path`;
          break;
        }
        let text = r.stdout;
        if (inv.reportFile) {
          try {
            text = await fs.readFile(inv.reportFile, 'utf-8');
          } catch {
            text = def.id === 'dotnet-format' && r.code === 0 ? '[]' : '';
          }
        }
        let raw;
        try {
          raw = def.parse(text, r.stderr, ctx);
        } catch (err) {
          status = 'failed';
          const detail = redact((r.stderr || r.stdout).trim()).slice(0, 800);
          message = `${def.id} exited with code ${r.code}${err instanceof ParseFailure ? ` and its output could not be parsed (${err.message.slice(0, 120)})` : ''}${detail ? `: ${detail}` : ''}`;
          break;
        }
        if (r.code === null || !def.okExit(r.code)) {
          if (raw.length === 0) {
            status = 'failed';
            message = `${def.id} exited with code ${r.code}: ${redact((r.stderr || r.stdout).trim()).slice(0, 800)}`;
            break;
          }
          message = `${def.id} exited with code ${r.code} (results parsed)`;
        }
        for (const d of raw) {
          const abs = d.path ? path.resolve(projectDir, d.path) : (config ?? projectDir);
          diags.push({
            file: relPath(root, abs),
            line: d.line || 1,
            column: d.column,
            endLine: d.endLine,
            endColumn: d.endColumn,
            severity: d.severity,
            rule: d.rule,
            message: redact(d.message),
            tool: def.id,
            fixable: d.fixable,
          });
        }
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }

    // Whole-project tools (tsc, clippy) report beyond the requested path: keep what was asked for.
    const kept = diags.filter((d) => {
      const abs = path.resolve(root, d.file);
      return inTarget(abs) && (scope.changed === null || isChanged(scope, abs) || !d.file);
    });
    return {
      run: {
        ...base,
        status,
        message,
        command: commands.slice(0, 3).join(' ; ') + (commands.length > 3 ? ` ; …(${commands.length} invocations)` : ''),
        config: config ? relPath(root, config) : undefined,
        source: cmd.source,
        issues: kept.length,
        fixApplied: opts.fix && def.supportsFix && status === 'ran' ? true : undefined,
        durationMs: Date.now() - started,
      },
      diags: status === 'ran' || kept.length ? kept : [],
    };
  });

  return {
    runs: results.map((r) => r.run),
    diagnostics: results.flatMap((r) => r.diags),
    toolVersions: versions,
  };
}
