// SPDX-License-Identifier: MIT
/**
 * Secret detection in the working tree and, optionally, git history.
 *
 * Engines, in `auto` order: gitleaks → trufflehog → trivy → built-in patterns.
 * History is only scanned by gitleaks/trufflehog; when history is requested
 * from an engine that cannot do it, the result says so (status `partial`)
 * instead of quietly returning a working-tree-only answer.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { writeFileSync } from 'fs';
import type { EngineRun, ScanResult, ScanSecretsInput, SecretPattern, SecurityFinding } from '../types.js';
import { runTool, stderrTail } from '../utils/exec.js';
import { buildResult, dedupeFindings } from '../utils/normalizer.js';
import { DEFAULT_SKIP_DIRS, makeExcludeMatcher, toRelPosix, validateScanPath } from '../utils/paths.js';
import { parseJson, readReport, withTempDir } from '../utils/report-file.js';
import { getTool, unavailableMessage, versionAtLeast, type ToolStatus } from '../utils/tool-checker.js';
import { changedFilesSince, isGitRepo } from '../utils/git.js';
import { parseGitleaks, parseTrufflehog } from '../parsers/secrets.js';
import { parseTrivyReport } from '../parsers/trivy.js';
import { runTrivyJson, timeoutMs } from './engines.js';

// Built-in patterns: the fallback when no secret scanner is installed.
const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'AWS Access Key ID', pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: 'CRITICAL', description: 'AWS Access Key ID detected' },
  {
    name: 'AWS Secret Access Key',
    pattern: /aws_secret_access_key\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    severity: 'CRITICAL',
    description: 'AWS Secret Access Key detected',
  },
  { name: 'GitHub Personal Access Token', pattern: /ghp_[a-zA-Z0-9]{36}/g, severity: 'CRITICAL', description: 'GitHub Personal Access Token detected' },
  {
    name: 'GitHub Fine-grained PAT',
    pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
    severity: 'CRITICAL',
    description: 'GitHub Fine-grained Personal Access Token detected',
  },
  { name: 'GitLab Token', pattern: /glpat-[a-zA-Z0-9_-]{20}/g, severity: 'CRITICAL', description: 'GitLab Personal Access Token detected' },
  { name: 'Stripe Secret Key', pattern: /\b[sr]k_live_[0-9a-zA-Z]{24,}\b/g, severity: 'CRITICAL', description: 'Stripe live secret key detected' },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, severity: 'HIGH', description: 'Slack Token detected' },
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key\s*[=:]\s*['"]([a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'HIGH',
    description: 'Potential API key detected',
  },
  { name: 'Generic Secret', pattern: /secret\s*[=:]\s*['"]([^'"]{10,})['"]?/gi, severity: 'MEDIUM', description: 'Potential secret value detected' },
  { name: 'Generic Password', pattern: /password\s*[=:]\s*['"]([^'"]+)['"]?/gi, severity: 'HIGH', description: 'Hardcoded password detected' },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    description: 'Private key detected',
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    severity: 'HIGH',
    description: 'JWT token detected (may contain sensitive claims)',
  },
  {
    name: 'Database Connection String',
    pattern: /(mongodb|postgres|mysql|redis):\/\/[^:\s]+:[^@\s]+@[^\s'"]+/gi,
    severity: 'CRITICAL',
    description: 'Database connection string with credentials detected',
  },
];

const BUILTIN_DEFAULT_EXCLUDE = ['*.min.js', '*.map', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

interface EngineOutput {
  run: EngineRun;
  findings: SecurityFinding[];
}

function fileUrl(root: string): string {
  const p = root.replace(/\\/g, '/');
  // trufflehog clones `file://<path>`: `file://C:/x` on Windows, `file:///x` on POSIX.
  return `file://${p}`;
}

async function runGitleaks(
  tool: ToolStatus,
  root: string,
  mode: 'dir' | 'git',
  input: ScanSecretsInput,
  base?: string
): Promise<EngineOutput> {
  const started = Date.now();
  const label = mode === 'git' ? 'gitleaks (history)' : 'gitleaks';
  try {
    const findings = await withTempDir(async (dir) => {
      const report = join(dir, 'gitleaks.json');
      const common = ['--report-format', 'json', '--report-path', report, '--redact', '--exit-code', '0', '--no-banner'];
      const modern = versionAtLeast(tool.version, '8.19.0');
      let args: string[];
      if (mode === 'dir') args = modern ? ['dir', root, ...common] : ['detect', '--source', root, '--no-git', ...common];
      else args = modern ? ['git', root, ...common] : ['detect', '--source', root, ...common];
      if (mode === 'git' && base) args.push('--log-opts', `${base}..HEAD`);
      const r = await runTool(tool.command!, args, { cwd: root, timeoutMs: timeoutMs(input.timeoutSeconds) }, 'gitleaks');
      if (r.exitCode !== 0) throw new Error(`gitleaks exited with ${r.exitCode}: ${stderrTail(r.stderr)}`);
      const raw = readReport(report, 'gitleaks');
      if (raw === null) throw new Error(`gitleaks wrote no report: ${stderrTail(r.stderr)}`);
      return parseGitleaks(parseJson(raw.trim() || '[]', 'gitleaks'), (p) => toRelPosix(root, p));
    });
    return { run: { engine: 'gitleaks', version: tool.version, status: 'ok', target: label, durationMs: Date.now() - started, findings: findings.length }, findings };
  } catch (err) {
    return { run: { engine: 'gitleaks', version: tool.version, status: 'failed', target: label, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }, findings: [] };
  }
}

async function runTrufflehog(
  tool: ToolStatus,
  root: string,
  mode: 'filesystem' | 'git',
  input: ScanSecretsInput,
  base?: string
): Promise<EngineOutput> {
  const started = Date.now();
  const label = mode === 'git' ? 'trufflehog (history)' : 'trufflehog';
  try {
    const findings = await withTempDir(async (dir) => {
      const args: string[] = [mode, mode === 'git' ? fileUrl(root) : root, '--json', '--no-update'];
      if (!input.verifySecrets) args.push('--no-verification');
      if (mode === 'filesystem') {
        // trufflehog's filesystem source walks .git/objects and dependency trees unless told not to.
        const excl = join(dir, 'exclude.txt');
        writeFileSync(excl, [...DEFAULT_SKIP_DIRS].map((d) => `(^|[\\\\/])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\\\/]|$)`).join('\n') + '\n');
        args.push('--exclude-paths', excl);
      }
      if (mode === 'git' && base) args.push('--since-commit', base);
      const r = await runTool(tool.command!, args, { cwd: root, timeoutMs: timeoutMs(input.timeoutSeconds) }, 'trufflehog');
      if (r.exitCode !== 0) throw new Error(`trufflehog exited with ${r.exitCode}: ${stderrTail(r.stderr)}`);
      return parseTrufflehog(r.stdout, (p) => toRelPosix(root, p));
    });
    return { run: { engine: 'trufflehog', version: tool.version, status: 'ok', target: label, durationMs: Date.now() - started, findings: findings.length }, findings };
  } catch (err) {
    return { run: { engine: 'trufflehog', version: tool.version, status: 'failed', target: label, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }, findings: [] };
  }
}

async function runTrivySecrets(root: string, input: ScanSecretsInput): Promise<EngineOutput> {
  const started = Date.now();
  try {
    const { report, version } = await runTrivyJson(
      'fs',
      ['--scanners', 'secret', '--skip-dirs', '**/node_modules', '--skip-dirs', '**/.git'],
      root,
      { cwd: root, timeoutSeconds: input.timeoutSeconds }
    );
    const findings = parseTrivyReport(report, { include: { secret: true, vuln: false, misconfig: false, license: false } }).findings.map((f) => ({
      ...f,
      location: { ...f.location, file: f.location.file ? toRelPosix(root, f.location.file) : undefined },
    }));
    return { run: { engine: 'trivy', version, status: 'ok', target: 'trivy', durationMs: Date.now() - started, findings: findings.length }, findings };
  } catch (err) {
    return { run: { engine: 'trivy', status: 'failed', target: 'trivy', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }, findings: [] };
  }
}

export async function scanWithBuiltin(root: string, excludePaths: string[], onlyFiles?: string[]): Promise<EngineOutput> {
  const started = Date.now();
  const findings: SecurityFinding[] = [];
  const isExcluded = makeExcludeMatcher([...BUILTIN_DEFAULT_EXCLUDE, ...excludePaths]);

  async function scanFile(filePath: string): Promise<void> {
    let content: string;
    try {
      const st = await stat(filePath);
      if (!st.isFile() || st.size >= 1024 * 1024) return;
      content = await readFile(filePath, 'utf-8');
    } catch {
      return;
    }
    if (content.includes('\0')) return; // binary
    const lines = content.split('\n');
    for (const pattern of SECRET_PATTERNS) {
      pattern.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const line = lines[lineNumber - 1] || '';
        if (/example|placeholder|your-|xxx|TODO|dummy|changeme/i.test(line)) continue;
        findings.push({
          id: `builtin-${pattern.name.toLowerCase().replace(/\s+/g, '-')}`,
          severity: pattern.severity,
          category: 'secret',
          source: 'builtin-secrets',
          title: pattern.name,
          description: pattern.description,
          location: { file: relative(root, filePath).split('\\').join('/'), line: lineNumber },
          remediation: 'Remove the secret from code, rotate it, and load it from environment variables or a secret manager',
        });
      }
    }
  }

  async function walkDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split('\\').join('/');
      if (entry.isDirectory()) {
        if (DEFAULT_SKIP_DIRS.has(entry.name) || isExcluded(rel)) continue;
        await walkDir(full);
      } else if (entry.isFile() && !isExcluded(rel)) {
        await scanFile(full);
      }
    }
  }

  try {
    if (onlyFiles) {
      for (const f of onlyFiles) if (!isExcluded(f)) await scanFile(join(root, f));
    } else {
      await walkDir(root);
    }
  } catch (error) {
    return { run: { engine: 'builtin-secrets', status: 'failed', durationMs: Date.now() - started, error: `built-in scan failed: ${error}` }, findings: [] };
  }
  return { run: { engine: 'builtin-secrets', status: 'ok', durationMs: Date.now() - started, findings: findings.length }, findings };
}

export async function scanSecrets(input: ScanSecretsInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const root = validateScanPath(input.path, { requireDirectory: true });
  const requested = input.tool ?? 'auto';
  const scanHistory = input.scanHistory ?? false;
  const excludePaths = input.excludePaths ?? [];
  const isExcluded = makeExcludeMatcher(excludePaths);
  const warnings: string[] = [];

  let changed: { base: string; files: string[] } | undefined;
  if (input.baseRef) changed = await changedFilesSince(root, input.baseRef);

  const repo = scanHistory || input.baseRef ? await isGitRepo(root) : false;
  if (scanHistory && !repo) warnings.push('scanHistory requested but the path is not inside a git work tree; only the working tree was scanned');

  // Pick the engine.
  const order: Array<'gitleaks' | 'trufflehog' | 'trivy' | 'builtin'> =
    requested === 'auto' ? ['gitleaks', 'trufflehog', 'trivy', 'builtin'] : [requested];
  let chosen: 'gitleaks' | 'trufflehog' | 'trivy' | 'builtin' | undefined;
  let chosenTool: ToolStatus | undefined;
  for (const e of order) {
    if (e === 'builtin') {
      chosen = e;
      break;
    }
    const t = await getTool(e);
    if (t.available) {
      chosen = e;
      chosenTool = t;
      break;
    }
    if (requested !== 'auto') {
      return buildResult({
        scanType: 'secrets',
        engines: [{ engine: e, status: 'unavailable', error: unavailableMessage(e, t) }],
        findings: [],
        startedAt,
      });
    }
  }

  const outputs: EngineOutput[] = [];
  const historyWanted = scanHistory && repo;
  switch (chosen) {
    case 'gitleaks':
      outputs.push(await runGitleaks(chosenTool!, root, 'dir', input));
      if (historyWanted) outputs.push(await runGitleaks(chosenTool!, root, 'git', input, changed?.base));
      break;
    case 'trufflehog':
      outputs.push(await runTrufflehog(chosenTool!, root, 'filesystem', input));
      if (historyWanted) outputs.push(await runTrufflehog(chosenTool!, root, 'git', input, changed?.base));
      break;
    case 'trivy':
      outputs.push(await runTrivySecrets(root, input));
      if (historyWanted) warnings.push('trivy cannot scan git history; install gitleaks or trufflehog for history scans');
      break;
    default:
      if (requested === 'auto') warnings.push('No secret scanner installed (gitleaks, trufflehog, trivy); used built-in patterns, which have lower coverage');
      outputs.push(await scanWithBuiltin(root, excludePaths, changed?.files));
      if (historyWanted) warnings.push('The built-in scanner cannot scan git history; install gitleaks or trufflehog for history scans');
      break;
  }
  if (input.verifySecrets && chosen !== 'trufflehog') warnings.push('verifySecrets only applies to trufflehog; findings were not verified');

  let findings = outputs.flatMap((o) => o.findings);
  const before = findings.length;
  findings = findings.filter((f) => !f.location.file || !isExcluded(f.location.file));
  const excludedByPath = before - findings.length;

  if (changed) {
    const set = new Set(changed.files);
    // Working-tree findings are limited to changed files; history findings are already limited to base..HEAD.
    findings = findings.filter((f) => f.location.commit || (f.location.file !== undefined && set.has(f.location.file)));
  }

  findings = dedupeFindings(findings, (f) => [f.id, f.location.file, f.location.line, f.location.commit ?? ''].join('|'));

  return buildResult({
    scanType: 'secrets',
    engines: outputs.map((o) => o.run),
    findings,
    startedAt,
    severityThreshold: input.severityThreshold,
    maxResults: input.maxResults,
    warnings,
    excludedByPath,
    diffBase: changed?.base,
    extra: { historyScanned: historyWanted && (chosen === 'gitleaks' || chosen === 'trufflehog'), changedFiles: changed?.files.length },
  });
}
