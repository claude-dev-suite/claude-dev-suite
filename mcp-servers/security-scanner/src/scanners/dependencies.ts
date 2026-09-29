// SPDX-License-Identifier: MIT
/**
 * Software composition analysis across ecosystems and monorepos.
 *
 * 1. Discover every manifest/lockfile under the root (recursive).
 * 2. Run one broad engine over the whole tree — trivy, else osv-scanner.
 * 3. For each discovered manifest the broad engine did not cover, fall back
 *    to the ecosystem's native auditor (npm/pnpm/yarn audit, pip-audit,
 *    cargo-audit, govulncheck) when installed.
 * 4. Anything still uncovered is listed in `notScanned` with the reason —
 *    never silently counted as clean.
 */

import { readFileSync } from 'fs';
import type { EngineRun, NotScanned, ScanDependenciesInput, ScanResult, SecurityFinding } from '../types.js';
import { runTool, stderrTail } from '../utils/exec.js';
import { buildResult } from '../utils/normalizer.js';
import { makeExcludeMatcher, toRelPosix, validateScanPath } from '../utils/paths.js';
import { parseJson } from '../utils/report-file.js';
import { getTool, unavailableMessage, type ToolId } from '../utils/tool-checker.js';
import { parseTrivyReport } from '../parsers/trivy.js';
import { parseOsvReport } from '../parsers/osv.js';
import { parseNpmAudit, parsePnpmAudit, parseYarnAudit } from '../parsers/js-audit.js';
import { parseCargoAudit, parseGovulncheck, parsePipAudit } from '../parsers/native-audit.js';
import { discoverManifests, type Manifest, type ManifestKind } from './discovery.js';
import { runOsvScanner, runTrivyJson, timeoutMs } from './engines.js';

const PM_KINDS: Record<string, ManifestKind[]> = {
  npm: ['npm'],
  yarn: ['yarn'],
  pnpm: ['pnpm'],
  pip: ['pip-requirements', 'poetry', 'uv', 'pipenv', 'pyproject'],
  cargo: ['cargo'],
  go: ['go'],
};

const PM_ECOSYSTEM: Record<string, string> = { npm: 'npm', yarn: 'npm', pnpm: 'npm', pip: 'PyPI', cargo: 'crates.io', go: 'Go' };

interface NativeSpec {
  tool: ToolId;
  label: EngineRun['engine'];
  args: (m: Manifest) => string[];
  parse: (stdout: string, m: Manifest) => SecurityFinding[];
  env?: Record<string, string>;
}

function readLock(m: Manifest): unknown {
  try {
    return JSON.parse(readFileSync(m.file, 'utf8'));
  } catch {
    return undefined;
  }
}

function isYarnBerry(m: Manifest): boolean {
  try {
    return readFileSync(m.file, 'utf8').slice(0, 4000).includes('__metadata:');
  } catch {
    return false;
  }
}

const COREPACK_ENV = { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };

const NATIVE: Partial<Record<ManifestKind, NativeSpec>> = {
  npm: {
    tool: 'npm',
    label: 'npm-audit',
    args: () => ['audit', '--json', '--package-lock-only'],
    parse: (out, m) => parseNpmAudit(parseJson(out, 'npm audit'), m.path, readLock(m)),
  },
  pnpm: {
    tool: 'pnpm',
    label: 'pnpm-audit',
    args: () => ['audit', '--json'],
    parse: (out, m) => parsePnpmAudit(parseJson(out, 'pnpm audit'), m.path),
    env: COREPACK_ENV,
  },
  yarn: {
    tool: 'yarn',
    label: 'yarn-audit',
    args: (m) => (isYarnBerry(m) ? ['npm', 'audit', '--json', '--all', '--recursive'] : ['audit', '--json']),
    parse: (out, m) => parseYarnAudit(out, m.path),
    env: COREPACK_ENV,
  },
  'pip-requirements': {
    tool: 'pip-audit',
    label: 'pip-audit',
    args: (m) => ['-r', m.file, '--format', 'json', '--progress-spinner', 'off'],
    parse: (out, m) => parsePipAudit(parseJson(out, 'pip-audit'), m.path),
  },
  pyproject: {
    tool: 'pip-audit',
    label: 'pip-audit',
    args: (m) => ['--format', 'json', '--progress-spinner', 'off', m.dir],
    parse: (out, m) => parsePipAudit(parseJson(out, 'pip-audit'), m.path),
  },
  cargo: {
    tool: 'cargo-audit',
    label: 'cargo-audit',
    args: (m) => ['audit', '--json', '--file', m.file],
    parse: (out, m) => parseCargoAudit(parseJson(out, 'cargo-audit'), m.path),
  },
  go: {
    tool: 'govulncheck',
    label: 'govulncheck',
    args: () => ['-json', './...'],
    parse: (out, m) => parseGovulncheck(out, m.path),
  },
};

async function runNative(
  m: Manifest,
  timeoutSeconds: number | undefined
): Promise<{ run: EngineRun; findings: SecurityFinding[]; gap?: NotScanned }> {
  const spec = NATIVE[m.kind];
  if (!spec) {
    return {
      run: { engine: 'native', status: 'skipped', target: m.path },
      findings: [],
      gap: { path: m.path, ecosystem: m.ecosystem, reason: `no native auditor reads ${m.kind} files; install trivy or osv-scanner` },
    };
  }
  const tool = await getTool(spec.tool);
  if (!tool.available || !tool.command) {
    return {
      run: { engine: spec.label, status: 'unavailable', target: m.path, error: tool.error },
      findings: [],
      gap: { path: m.path, ecosystem: m.ecosystem, reason: `${spec.tool} not installed (and no broad engine covered it); install trivy or osv-scanner` },
    };
  }
  const started = Date.now();
  try {
    const r = await runTool(tool.command, spec.args(m), { cwd: m.dir, timeoutMs: timeoutMs(timeoutSeconds), env: spec.env }, spec.label);
    // Most auditors exit non-zero when they find vulnerabilities; the output decides.
    if (!r.stdout.trim()) {
      throw new Error(`no output (exit ${r.exitCode}): ${stderrTail(r.stderr) || 'no error output'}`);
    }
    let findings: SecurityFinding[];
    try {
      findings = spec.parse(r.stdout, m);
    } catch (err) {
      throw new Error(`${err instanceof Error ? err.message : String(err)} (exit ${r.exitCode}; ${stderrTail(r.stderr)})`);
    }
    return {
      run: { engine: spec.label, version: tool.version, status: 'ok', target: m.path, durationMs: Date.now() - started, findings: findings.length },
      findings,
    };
  } catch (err) {
    return {
      run: { engine: spec.label, version: tool.version, status: 'failed', target: m.path, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) },
      findings: [],
      gap: { path: m.path, ecosystem: m.ecosystem, reason: `${spec.label} failed` },
    };
  }
}

export async function scanDependencies(input: ScanDependenciesInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const root = validateScanPath(input.path, { requireDirectory: true });
  const pm = input.packageManager ?? 'auto';
  const engine = input.engine ?? 'auto';
  const isExcluded = makeExcludeMatcher(input.excludePaths ?? []);
  const warnings: string[] = [];

  const discovery = discoverManifests(root, isExcluded);
  if (discovery.limited) warnings.push('manifest discovery hit its directory/depth limit; deeply nested projects may be missing');

  const kinds = pm === 'auto' ? undefined : PM_KINDS[pm];
  const manifests = kinds ? discovery.manifests.filter((m) => kinds.includes(m.kind)) : discovery.manifests;
  let gaps = pm === 'auto' ? discovery.gaps : discovery.gaps.filter((g) => g.ecosystem === PM_ECOSYSTEM[pm]);

  if (manifests.length === 0 && gaps.length === 0) {
    return buildResult({
      scanType: 'dependencies',
      engines: [],
      findings: [],
      startedAt,
      status: 'skipped',
      warnings: [
        pm === 'auto'
          ? 'No dependency manifests or lockfiles found (looked for npm/yarn/pnpm, pip/poetry/uv/pipenv, go, cargo, maven/gradle, nuget, composer, bundler)'
          : `No ${pm} manifests found`,
      ],
    });
  }

  const engines: EngineRun[] = [];
  let findings: SecurityFinding[] = [];
  const covered = new Set<string>();
  const relevant = new Set(manifests.map((m) => m.path));
  const keepFinding = (f: SecurityFinding) => !kinds || (f.location.file !== undefined && relevant.has(f.location.file));

  // --- broad engine -------------------------------------------------------
  const tryTrivy = engine === 'trivy' || engine === 'auto';
  const tryOsv = engine === 'osv-scanner' || engine === 'auto';
  let broadDone = false;

  if (tryTrivy && !broadDone) {
    const t = await getTool('trivy');
    if (t.available) {
      const started = Date.now();
      try {
        // Excludes are applied to the findings afterwards; trivy only skips dependency trees.
        const args = ['--scanners', 'vuln', '--skip-dirs', '**/node_modules', '--skip-dirs', '**/.git'];
        const { report, version } = await runTrivyJson('fs', args, root, { cwd: root, timeoutSeconds: input.timeoutSeconds });
        const parsed = parseTrivyReport(report, { include: { vuln: true, misconfig: false, secret: false, license: false } });
        for (const tg of parsed.targets) if (tg.class === 'lang-pkgs' || tg.class === 'os-pkgs') covered.add(toRelPosix(root, tg.target));
        const own = parsed.findings.map((f) => ({ ...f, location: { ...f.location, file: f.location.file ? toRelPosix(root, f.location.file) : f.location.file } })).filter(keepFinding);
        findings.push(...own);
        engines.push({ engine: 'trivy', version, status: 'ok', target: '.', durationMs: Date.now() - started, findings: own.length });
        broadDone = true;
      } catch (err) {
        engines.push({ engine: 'trivy', version: t.version, status: 'failed', target: '.', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
      }
    } else if (engine === 'trivy') {
      engines.push({ engine: 'trivy', status: 'unavailable', error: unavailableMessage('trivy', t) });
    }
  }

  if (tryOsv && !broadDone) {
    const t = await getTool('osv-scanner');
    if (t.available) {
      const started = Date.now();
      try {
        const excl = (input.excludePaths ?? []).flatMap((p) => ['--experimental-exclude', p.includes('*') ? `g:${p}` : p]);
        const r = await runOsvScanner(root, ['--all-packages', ...excl], { timeoutSeconds: input.timeoutSeconds });
        if (!r.noPackages) {
          const parsed = parseOsvReport(r.report, (p) => toRelPosix(root, p));
          for (const s of parsed.sources) covered.add(s.path);
          const own = parsed.findings.filter(keepFinding);
          findings.push(...own);
          engines.push({ engine: 'osv-scanner', version: r.version, status: 'ok', target: '.', durationMs: Date.now() - started, findings: own.length });
        } else {
          engines.push({ engine: 'osv-scanner', version: r.version, status: 'ok', target: '.', durationMs: Date.now() - started, findings: 0 });
          warnings.push('osv-scanner found no packages it could read');
        }
        broadDone = true;
      } catch (err) {
        engines.push({ engine: 'osv-scanner', version: t.version, status: 'failed', target: '.', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
      }
    } else if (engine === 'osv-scanner') {
      engines.push({ engine: 'osv-scanner', status: 'unavailable', error: unavailableMessage('osv-scanner', t) });
    }
  }

  if (engine === 'auto' && !broadDone && !engines.some((e) => e.engine === 'trivy' || e.engine === 'osv-scanner')) {
    warnings.push('Neither trivy nor osv-scanner is installed; only ecosystems with a native auditor were scanned');
  }

  const broadEngine = engines.find((e) => e.target === '.' && e.status === 'ok')?.engine;

  // --- native fallback for anything the broad engine did not cover ----------
  const allowNative = engine === 'auto' || engine === 'native';
  const uncovered = manifests.filter((m) => !covered.has(m.path));
  const notScanned: NotScanned[] = [];
  for (const m of uncovered) {
    if (!allowNative) {
      notScanned.push({ path: m.path, ecosystem: m.ecosystem, reason: `${engine} did not report this file` });
      continue;
    }
    const r = await runNative(m, input.timeoutSeconds);
    if (r.run.status !== 'skipped') engines.push(r.run);
    findings.push(...r.findings);
    if (r.gap) notScanned.push(r.gap);
  }

  // A manifest the engine read anyway (e.g. a .csproj trivy handles) is not a gap.
  gaps = gaps.filter((g) => !covered.has(g.path));
  notScanned.push(...gaps);

  findings = findings.filter((f) => !f.location.file || !isExcluded(f.location.file));

  return buildResult({
    scanType: 'dependencies',
    engines,
    findings,
    startedAt,
    severityThreshold: input.severityThreshold,
    maxResults: input.maxResults,
    warnings,
    notScanned,
    extra: {
      manifests: manifests.slice(0, 200).map((m) => ({
        path: m.path,
        ecosystem: m.ecosystem,
        scannedBy: covered.has(m.path) ? broadEngine : (engines.find((e) => e.target === m.path && e.status === 'ok')?.engine ?? null),
      })),
    },
  });
}

