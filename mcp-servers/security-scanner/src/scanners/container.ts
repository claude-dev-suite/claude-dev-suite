// SPDX-License-Identifier: MIT
/**
 * Container images and filesystems (trivy), and IaC misconfiguration
 * scanning (`trivy config`: Dockerfile, Kubernetes, Terraform, Helm,
 * CloudFormation, Azure ARM).
 */

import { statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname } from 'path';
import type { ScanContainerInput, ScanIacInput, ScanResult } from '../types.js';
import { buildResult, errorResult } from '../utils/normalizer.js';
import { makeExcludeMatcher, toRelPosix, validateScanPath } from '../utils/paths.js';
import { getTool, unavailableMessage } from '../utils/tool-checker.js';
import { parseTrivyReport } from '../parsers/trivy.js';
import { runTrivyJson } from './engines.js';

/** Image references: registry/name[:tag][@digest]; no whitespace, no leading dash. */
const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:@+]*$/;

export async function scanContainer(input: ScanContainerInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const { target, type } = input;

  // A leading dash would be read as a trivy flag.
  if (target.startsWith('-')) {
    return errorResult('container', 'failed', 'trivy', `Invalid target: "${target}" — target must not start with a dash`, startedAt);
  }

  let cwd: string;
  let scanTarget = target;
  if (type === 'image') {
    if (!IMAGE_RE.test(target) || target.length > 512) {
      return errorResult('container', 'failed', 'trivy', `Invalid image reference: "${target}"`, startedAt);
    }
    cwd = tmpdir();
  } else {
    try {
      scanTarget = validateScanPath(target);
    } catch (err) {
      return errorResult('container', 'failed', 'trivy', err instanceof Error ? err.message : String(err), startedAt);
    }
    cwd = scanTarget;
  }

  const tool = await getTool('trivy');
  if (!tool.available) return errorResult('container', 'unavailable', 'trivy', unavailableMessage('trivy', tool), startedAt);

  const scanners = ['vuln', 'secret', ...(type === 'image' ? [] : ['misconfig']), ...(input.includeLicenses ? ['license'] : [])];
  const args = ['--scanners', scanners.join(',')];
  if (type === 'image') args.push('--image-config-scanners', 'misconfig,secret');
  else args.push('--skip-dirs', '**/node_modules', '--skip-dirs', '**/.git');

  const started = Date.now();
  try {
    const { report, version } = await runTrivyJson(type === 'image' ? 'image' : 'fs', args, scanTarget, {
      cwd: type === 'image' ? cwd : statDir(scanTarget),
      timeoutSeconds: input.timeoutSeconds,
    });
    const parsed = parseTrivyReport(report, { image: type === 'image' ? target : undefined });
    const findings = type === 'image'
      ? parsed.findings
      : parsed.findings.map((f) => ({ ...f, location: { ...f.location, file: f.location.file ? toRelPosix(scanTarget, f.location.file) : undefined } }));
    return buildResult({
      scanType: 'container',
      engines: [{ engine: 'trivy', version, status: 'ok', target, durationMs: Date.now() - started, findings: findings.length }],
      findings,
      startedAt,
      severityThreshold: input.severityThreshold,
      maxResults: input.maxResults,
      extra: { scanners, targets: parsed.targets.map((t) => `${t.target} [${t.class}${t.type ? `/${t.type}` : ''}]`).slice(0, 50) },
    });
  } catch (err) {
    return buildResult({
      scanType: 'container',
      engines: [{ engine: 'trivy', version: tool.version, status: 'failed', target, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }],
      findings: [],
      startedAt,
    });
  }
}

function statDir(p: string): string {
  // `trivy fs` accepts a single file too; run it from the file's directory.
  try {
    return statSync(p).isDirectory() ? p : dirname(p);
  } catch {
    return p;
  }
}

export async function scanIac(input: ScanIacInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const root = validateScanPath(input.path, { requireDirectory: true });
  const isExcluded = makeExcludeMatcher(input.excludePaths ?? []);
  const tool = await getTool('trivy');
  if (!tool.available) return errorResult('iac', 'unavailable', 'trivy', unavailableMessage('trivy', tool), startedAt);

  const started = Date.now();
  try {
    const { report, version } = await runTrivyJson('config', ['--skip-dirs', '**/node_modules', '--skip-dirs', '**/.git'], root, {
      cwd: root,
      timeoutSeconds: input.timeoutSeconds,
    });
    const parsed = parseTrivyReport(report, { include: { misconfig: true, vuln: false, secret: false, license: false } });
    let findings = parsed.findings.map((f) => ({ ...f, location: { ...f.location, file: f.location.file ? toRelPosix(root, f.location.file) : undefined } }));
    const before = findings.length;
    findings = findings.filter((f) => !f.location.file || !isExcluded(f.location.file));
    const configTargets = parsed.targets.filter((t) => t.class === 'config');
    const iacTypes = [...new Set(configTargets.map((t) => t.type).filter(Boolean))];
    return buildResult({
      scanType: 'iac',
      engines: [{ engine: 'trivy', version, status: 'ok', target: '.', durationMs: Date.now() - started, findings: findings.length }],
      findings,
      startedAt,
      severityThreshold: input.severityThreshold,
      maxResults: input.maxResults,
      excludedByPath: before - findings.length,
      status: configTargets.length === 0 ? 'skipped' : undefined,
      warnings: configTargets.length === 0 ? ['No IaC files recognised (Dockerfile, Kubernetes, Terraform, Helm, CloudFormation, ARM)'] : [],
      extra: { iacTypes, filesScanned: configTargets.length },
    });
  } catch (err) {
    return buildResult({
      scanType: 'iac',
      engines: [{ engine: 'trivy', version: tool.version, status: 'failed', target: '.', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }],
      findings: [],
      startedAt,
    });
  }
}
