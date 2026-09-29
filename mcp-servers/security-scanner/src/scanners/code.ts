// SPDX-License-Identifier: MIT
/**
 * SAST with Semgrep. Rulesets are configurable (registry packs such as
 * `p/security-audit`, `p/owasp-top-ten`, or local rule files); in diff mode
 * only files changed since `baseRef` are scanned.
 */

import type { ScanCodeInput, ScanResult } from '../types.js';
import { runTool, stderrTail } from '../utils/exec.js';
import { buildResult, errorResult } from '../utils/normalizer.js';
import { makeExcludeMatcher, toRelPosix, validateScanPath } from '../utils/paths.js';
import { parseJson } from '../utils/report-file.js';
import { getTool, unavailableMessage } from '../utils/tool-checker.js';
import { changedFilesSince } from '../utils/git.js';
import { parseSemgrep } from '../parsers/semgrep.js';
import { timeoutMs } from './engines.js';

const MAX_TARGET_ARG_CHARS = 24000; // stay well under the Windows 32K command-line limit

export function validateRuleConfig(rule: string): void {
  if (!rule || rule.startsWith('-') || /[\0\r\n]/.test(rule) || rule.length > 500) {
    throw new Error(`Invalid semgrep rule/config "${rule}"`);
  }
}

export async function scanCode(input: ScanCodeInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const root = validateScanPath(input.path);
  const rules = input.rules?.length ? input.rules : ['p/security-audit'];
  rules.forEach(validateRuleConfig);
  const excludes = input.excludePaths ?? [];
  const isExcluded = makeExcludeMatcher(excludes);
  const warnings: string[] = [];

  const tool = await getTool('semgrep');
  if (!tool.available || !tool.command) {
    return errorResult('code', 'unavailable', 'semgrep', unavailableMessage('semgrep', tool), startedAt);
  }

  let targets = [root];
  let changed: { base: string; files: string[] } | undefined;
  if (input.baseRef) {
    changed = await changedFilesSince(root, input.baseRef);
    const files = changed.files.filter((f) => !isExcluded(f));
    if (files.length === 0) {
      return buildResult({
        scanType: 'code',
        engines: [{ engine: 'semgrep', version: tool.version, status: 'skipped', error: 'no changed files' }],
        findings: [],
        startedAt,
        status: 'ok',
        diffBase: changed.base,
        warnings: [`No files changed since ${input.baseRef}; nothing to scan`],
      });
    }
    const joined = files.join(' ');
    if (joined.length <= MAX_TARGET_ARG_CHARS) targets = files;
    else warnings.push(`${files.length} changed files: scanned the whole path and filtered results to the changed files`);
  }

  // `--config auto` needs metrics enabled; everything else runs with metrics off.
  const metrics = rules.includes('auto') ? [] : ['--metrics=off'];
  const args = [
    'scan',
    ...rules.map((r) => `--config=${r}`),
    '--json',
    '--quiet',
    '--disable-version-check',
    ...metrics,
    ...excludes.map((e) => `--exclude=${e}`),
    '--',
    ...targets,
  ];

  const started = Date.now();
  let parsed;
  try {
    const r = await runTool(tool.command, args, { cwd: root, timeoutMs: timeoutMs(input.timeoutSeconds) }, 'semgrep');
    if (!r.stdout.trim()) {
      throw new Error(`semgrep exited with ${r.exitCode} and no output: ${stderrTail(r.stderr) || 'no error output'}`);
    }
    parsed = parseSemgrep(parseJson(r.stdout, 'semgrep'), (p) => toRelPosix(root, p));
    if (parsed.fatal || (r.exitCode !== 0 && r.exitCode !== 1 && parsed.findings.length === 0)) {
      throw new Error(`semgrep reported errors (exit ${r.exitCode}): ${parsed.errors.slice(0, 3).join(' | ') || stderrTail(r.stderr)}`);
    }
  } catch (err) {
    return buildResult({
      scanType: 'code',
      engines: [{ engine: 'semgrep', version: tool.version, status: 'failed', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }],
      findings: [],
      startedAt,
    });
  }

  warnings.push(...parsed.errors.slice(0, 10));
  let findings = parsed.findings;
  const before = findings.length;
  findings = findings.filter((f) => !f.location.file || !isExcluded(f.location.file));
  const excludedByPath = before - findings.length;
  if (changed) {
    const set = new Set(changed.files);
    findings = findings.filter((f) => f.location.file !== undefined && set.has(f.location.file));
  }

  return buildResult({
    scanType: 'code',
    engines: [{ engine: 'semgrep', version: tool.version, status: 'ok', durationMs: Date.now() - started, findings: findings.length }],
    findings,
    startedAt,
    severityThreshold: input.severityThreshold,
    maxResults: input.maxResults,
    warnings,
    excludedByPath,
    diffBase: changed?.base,
    extra: { rules, scannedFiles: parsed.scannedFiles },
  });
}
