// SPDX-License-Identifier: MIT
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type Category = 'vulnerability' | 'secret' | 'misconfiguration' | 'code-smell';
export type ScannerSource = 'npm-audit' | 'pip-audit' | 'cargo-audit' | 'govulncheck' |
                            'gitleaks' | 'trufflehog' | 'builtin-secrets' |
                            'semgrep' | 'trivy';

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
    column?: number;
    package?: string;
    version?: string;
    image?: string;
  };
  remediation?: string;
  references?: string[];
  metadata?: Record<string, unknown>;
}

export interface ScanResult {
  scanner: string;
  timestamp: Date;
  duration: number;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  toolAvailable: boolean;
  error?: string;
}

export interface ToolInfo {
  name: string;
  available: boolean;
  version?: string;
  installCmd?: string;
}

export interface CheckToolsResult {
  tools: Record<string, ToolInfo>;
}

// Input schemas for tools
export interface ScanDependenciesInput {
  path: string;
  packageManager?: 'auto' | 'npm' | 'pip' | 'cargo' | 'go';
  severityThreshold?: Severity;
}

export interface ScanSecretsInput {
  path: string;
  tool?: 'gitleaks' | 'trufflehog' | 'auto';
  scanHistory?: boolean;
  excludePaths?: string[];
}

export interface ScanCodeInput {
  path: string;
  rules?: string[];
}

export interface ScanContainerInput {
  target: string;
  type: 'image' | 'filesystem';
  severityThreshold?: Severity;
}

export interface ScanAllInput {
  path: string;
  include?: ('dependencies' | 'secrets' | 'code' | 'container')[];
  containerTarget?: string;
}

export interface ScanAllResult {
  timestamp: Date;
  totalDuration: number;
  results: {
    dependencies?: ScanResult;
    secrets?: ScanResult;
    code?: ScanResult;
    container?: ScanResult;
  };
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
}

// Secret pattern for built-in scanner
export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
}
