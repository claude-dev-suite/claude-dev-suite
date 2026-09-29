// SPDX-License-Identifier: MIT

/**
 * `UNKNOWN` is used when the producing tool gives no severity and none can be
 * derived (pip-audit, govulncheck). It is never guessed upward or downward:
 * a severity threshold keeps UNKNOWN findings, because they cannot be proven
 * to fall below it.
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'UNKNOWN';
export type ThresholdSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type Category = 'vulnerability' | 'secret' | 'misconfiguration' | 'code-smell' | 'license';

/** The engine that produced a finding. */
export type ScannerSource =
  | 'trivy'
  | 'osv-scanner'
  | 'npm-audit'
  | 'pnpm-audit'
  | 'yarn-audit'
  | 'pip-audit'
  | 'cargo-audit'
  | 'govulncheck'
  | 'gitleaks'
  | 'trufflehog'
  | 'builtin-secrets'
  | 'semgrep'
  | 'syft';

export type ScanType = 'dependencies' | 'secrets' | 'code' | 'container' | 'iac' | 'licenses';

export interface SecurityFinding {
  id: string;
  severity: Severity;
  category: Category;
  source: ScannerSource;
  title: string;
  description: string;
  location: {
    file?: string;
    line?: number;
    endLine?: number;
    column?: number;
    package?: string;
    version?: string;
    ecosystem?: string;
    image?: string;
    commit?: string;
  };
  /** Human-readable remediation (kept for backwards compatibility). */
  remediation?: string;
  /** Structured fix data where the producing tool provides it. */
  fix?: {
    fixedVersions?: string[];
    remediation?: string;
  };
  references?: string[];
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

export interface Summary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  unknown: number;
  total: number;
}

/**
 * `ok`          every engine the scan needed ran successfully
 * `partial`     something ran, but part of the scope was not covered (see warnings / notScanned)
 * `failed`      the scan could not produce a trustworthy result (see error)
 * `unavailable` the required tool is not installed (see error for the install hint)
 * `skipped`     nothing applicable to scan (e.g. no dependency manifests)
 */
export type ScanStatus = 'ok' | 'partial' | 'failed' | 'unavailable' | 'skipped';

export interface EngineRun {
  engine: string;
  version?: string;
  status: 'ok' | 'failed' | 'unavailable' | 'skipped';
  target?: string;
  durationMs?: number;
  findings?: number;
  error?: string;
}

export interface NotScanned {
  path: string;
  ecosystem: string;
  reason: string;
}

export interface ScanResult {
  scanType: ScanType;
  status: ScanStatus;
  /** Comma-separated engines that ran (kept for backwards compatibility). */
  scanner: string;
  engines: EngineRun[];
  timestamp: string;
  duration: number;
  findings: SecurityFinding[];
  /** Counts of every finding at or above the threshold, before the result cap. */
  summary: Summary;
  totalFindings: number;
  returnedFindings: number;
  truncated: boolean;
  belowThreshold?: number;
  excludedByPath?: number;
  notScanned?: NotScanned[];
  warnings: string[];
  toolAvailable: boolean;
  error?: string;
  diffBase?: string;
  extra?: Record<string, unknown>;
}

export interface CommonScanOptions {
  severityThreshold?: ThresholdSeverity;
  maxResults?: number;
  timeoutSeconds?: number;
}

export interface ScanDependenciesInput extends CommonScanOptions {
  path: string;
  packageManager?: 'auto' | 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go';
  engine?: 'auto' | 'trivy' | 'osv-scanner' | 'native';
  excludePaths?: string[];
}

export interface ScanSecretsInput extends CommonScanOptions {
  path: string;
  tool?: 'auto' | 'gitleaks' | 'trufflehog' | 'trivy' | 'builtin';
  scanHistory?: boolean;
  excludePaths?: string[];
  baseRef?: string;
  verifySecrets?: boolean;
}

export interface ScanCodeInput extends CommonScanOptions {
  path: string;
  rules?: string[];
  excludePaths?: string[];
  baseRef?: string;
}

export interface ScanContainerInput extends CommonScanOptions {
  target: string;
  type: 'image' | 'filesystem';
  includeLicenses?: boolean;
}

export interface ScanIacInput extends CommonScanOptions {
  path: string;
  excludePaths?: string[];
}

export interface ScanLicensesInput extends CommonScanOptions {
  path: string;
  engine?: 'auto' | 'osv-scanner' | 'trivy';
  allow?: string[];
  deny?: string[];
  includeInventory?: boolean;
}

// Secret pattern for built-in scanner
export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
}
