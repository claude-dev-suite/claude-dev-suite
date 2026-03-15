// SPDX-License-Identifier: MIT
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { ScanResult, SecurityFinding, ScanSecretsInput, SecretPattern } from '../types.js';
import { isToolAvailable, getInstallCommand } from '../utils/tool-checker.js';
import { createEmptyResult, calculateSummary } from '../utils/normalizer.js';

const execFileAsync = promisify(execFile);

// Built-in secret patterns for fallback
const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'CRITICAL',
    description: 'AWS Access Key ID detected',
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /aws_secret_access_key\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    severity: 'CRITICAL',
    description: 'AWS Secret Access Key detected',
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'CRITICAL',
    description: 'GitHub Personal Access Token detected',
  },
  {
    name: 'GitHub Fine-grained PAT',
    pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
    severity: 'CRITICAL',
    description: 'GitHub Fine-grained Personal Access Token detected',
  },
  {
    name: 'GitLab Token',
    pattern: /glpat-[a-zA-Z0-9_-]{20}/g,
    severity: 'CRITICAL',
    description: 'GitLab Personal Access Token detected',
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    severity: 'HIGH',
    description: 'Slack Token detected',
  },
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key\s*[=:]\s*['"]([a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'HIGH',
    description: 'Potential API key detected',
  },
  {
    name: 'Generic Secret',
    pattern: /secret\s*[=:]\s*['"]([^'"]{10,})['"]?/gi,
    severity: 'MEDIUM',
    description: 'Potential secret value detected',
  },
  {
    name: 'Generic Password',
    pattern: /password\s*[=:]\s*['"]([^'"]+)['"]?/gi,
    severity: 'HIGH',
    description: 'Hardcoded password detected',
  },
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
    pattern: /(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
    severity: 'CRITICAL',
    description: 'Database connection string with credentials detected',
  },
];

const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  'target',
  'vendor',
  '*.min.js',
  '*.map',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

async function scanWithGitleaks(path: string, scanHistory: boolean): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'gitleaks';

  try {
    const gitleaksArgs = ['detect', '--source', path, '--report-format', 'json', '--report-path', '/dev/stdout'];
    if (!scanHistory) gitleaksArgs.push('--no-git');
    const { stdout } = await execFileAsync(
      'gitleaks',
      gitleaksArgs,
      { maxBuffer: 50 * 1024 * 1024 }
    ).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '[]' }));

    const leaks = JSON.parse(stdout || '[]');
    const findings: SecurityFinding[] = leaks.map((leak: any) => ({
      id: leak.RuleID || 'gitleaks-finding',
      severity: 'HIGH', // gitleaks doesn't provide severity
      category: 'secret',
      source: 'gitleaks',
      title: leak.Description || `Secret detected: ${leak.RuleID}`,
      description: leak.Description || 'Potential secret or credential detected',
      location: {
        file: leak.File,
        line: leak.StartLine,
      },
      remediation: 'Remove the secret and rotate the credential immediately',
      metadata: {
        match: leak.Match ? `${leak.Match.substring(0, 20)}...` : undefined,
        commit: leak.Commit,
        author: leak.Author,
      },
    }));

    return {
      scanner,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      findings,
      summary: calculateSummary(findings),
      toolAvailable: true,
    };
  } catch (error) {
    return createEmptyResult(scanner, true, `gitleaks failed: ${error}`);
  }
}

async function scanWithTrufflehog(path: string, scanHistory: boolean): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'trufflehog';

  try {
    const scanType = scanHistory ? 'git' : 'filesystem';
    const { stdout } = await execFileAsync(
      'trufflehog',
      [scanType, path, '--json'],
      { maxBuffer: 50 * 1024 * 1024 }
    ).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '' }));

    const findings: SecurityFinding[] = [];

    // trufflehog outputs NDJSON
    for (const line of stdout.split('\n').filter(Boolean)) {
      try {
        const leak = JSON.parse(line);
        if (leak.SourceMetadata) {
          findings.push({
            id: leak.DetectorName || 'trufflehog-finding',
            severity: leak.Verified ? 'CRITICAL' : 'HIGH',
            category: 'secret',
            source: 'trufflehog',
            title: `${leak.DetectorName || 'Secret'} detected`,
            description: leak.Verified ? 'Verified credential - actively valid!' : 'Potential secret detected',
            location: {
              file: leak.SourceMetadata?.Data?.Filesystem?.file || leak.SourceMetadata?.Data?.Git?.file,
              line: leak.SourceMetadata?.Data?.Filesystem?.line || leak.SourceMetadata?.Data?.Git?.line,
            },
            remediation: 'Remove the secret and rotate the credential immediately',
            metadata: {
              verified: leak.Verified,
              detectorType: leak.DetectorType,
            },
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return {
      scanner,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      findings,
      summary: calculateSummary(findings),
      toolAvailable: true,
    };
  } catch (error) {
    return createEmptyResult(scanner, true, `trufflehog failed: ${error}`);
  }
}

async function scanWithBuiltin(path: string, excludePaths: string[]): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'builtin-secrets';
  const findings: SecurityFinding[] = [];

  const allExcludes = [...DEFAULT_EXCLUDE, ...excludePaths];

  async function shouldExclude(filePath: string): Promise<boolean> {
    const relativePath = relative(path, filePath);
    return allExcludes.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(relativePath);
      }
      return relativePath.includes(pattern);
    });
  }

  async function scanFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const pattern of SECRET_PATTERNS) {
        // Reset regex lastIndex for global patterns
        pattern.pattern.lastIndex = 0;

        let match;
        while ((match = pattern.pattern.exec(content)) !== null) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          const line = lines[lineNumber - 1] || '';

          // Skip if it looks like an example or placeholder
          if (
            line.includes('example') ||
            line.includes('placeholder') ||
            line.includes('your-') ||
            line.includes('xxx') ||
            line.includes('TODO')
          ) {
            continue;
          }

          findings.push({
            id: `builtin-${pattern.name.toLowerCase().replace(/\s+/g, '-')}`,
            severity: pattern.severity,
            category: 'secret',
            source: 'builtin-secrets',
            title: pattern.name,
            description: pattern.description,
            location: {
              file: relative(path, filePath),
              line: lineNumber,
            },
            remediation: 'Remove the secret from code and use environment variables or a secret manager',
          });
        }
      }
    } catch {
      // Skip files that can't be read (binary, permissions, etc.)
    }
  }

  async function walkDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (await shouldExclude(fullPath)) continue;

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath);
        // Skip files larger than 1MB
        if (stats.size < 1024 * 1024) {
          await scanFile(fullPath);
        }
      }
    }
  }

  try {
    await walkDir(path);
  } catch (error) {
    return createEmptyResult(scanner, true, `Built-in scan failed: ${error}`);
  }

  return {
    scanner,
    timestamp: new Date(),
    duration: Date.now() - startTime,
    findings,
    summary: calculateSummary(findings),
    toolAvailable: true,
  };
}

export async function scanSecrets(input: ScanSecretsInput): Promise<ScanResult> {
  const { path, tool = 'auto', scanHistory = false, excludePaths = [] } = input;

  if (tool === 'gitleaks' || tool === 'auto') {
    if (await isToolAvailable('gitleaks')) {
      return scanWithGitleaks(path, scanHistory);
    }
    if (tool === 'gitleaks') {
      return createEmptyResult('gitleaks', false, `gitleaks not installed. ${getInstallCommand('gitleaks')}`);
    }
  }

  if (tool === 'trufflehog' || tool === 'auto') {
    if (await isToolAvailable('trufflehog')) {
      return scanWithTrufflehog(path, scanHistory);
    }
    if (tool === 'trufflehog') {
      return createEmptyResult('trufflehog', false, `trufflehog not installed. ${getInstallCommand('trufflehog')}`);
    }
  }

  // Fallback to built-in scanner
  console.error('No external secret scanner available, using built-in pattern matching');
  return scanWithBuiltin(path, excludePaths);
}
