// SPDX-License-Identifier: MIT
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import type { ScanResult, SecurityFinding, ScanCodeInput } from '../types.js';
import { isToolAvailable, getInstallCommand } from '../utils/tool-checker.js';
import { createEmptyResult, calculateSummary, normalizeSeverity } from '../utils/normalizer.js';

const execFileAsync = promisify(execFile);

export async function scanCode(input: ScanCodeInput): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'semgrep';
  const { path, rules = ['p/security-audit'] } = input;

  if (!(await isToolAvailable('semgrep'))) {
    return createEmptyResult(scanner, false, `semgrep not installed. ${getInstallCommand('semgrep')}`);
  }

  try {
    const semgrepArgs = [...rules.map(r => `--config=${r}`), '--json', resolve(path)];
    const { stdout } = await execFileAsync(
      'semgrep',
      semgrepArgs,
      {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000, // 5 minute timeout
      }
    ).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '{}', stderr: '' }));

    const results = JSON.parse(stdout);
    const findings: SecurityFinding[] = (results.results || []).map((r: any) => ({
      id: r.check_id || 'semgrep-finding',
      severity: normalizeSeverity(r.extra?.severity || 'WARNING', 'semgrep'),
      category: categorizeRule(r.check_id),
      source: 'semgrep',
      title: r.extra?.message || r.check_id,
      description: r.extra?.message || 'Security issue detected by Semgrep',
      location: {
        file: r.path,
        line: r.start?.line,
        column: r.start?.col,
      },
      remediation: r.extra?.fix || r.extra?.metadata?.fix || undefined,
      references: r.extra?.metadata?.references || [],
      metadata: {
        ruleId: r.check_id,
        category: r.extra?.metadata?.category,
        confidence: r.extra?.metadata?.confidence,
        cwe: r.extra?.metadata?.cwe,
        owasp: r.extra?.metadata?.owasp,
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
    return createEmptyResult(scanner, true, `semgrep failed: ${error}`);
  }
}

function categorizeRule(ruleId: string): SecurityFinding['category'] {
  const ruleLower = ruleId.toLowerCase();

  if (
    ruleLower.includes('injection') ||
    ruleLower.includes('sqli') ||
    ruleLower.includes('xss') ||
    ruleLower.includes('command-injection') ||
    ruleLower.includes('path-traversal')
  ) {
    return 'vulnerability';
  }

  if (
    ruleLower.includes('hardcoded') ||
    ruleLower.includes('secret') ||
    ruleLower.includes('password') ||
    ruleLower.includes('credential')
  ) {
    return 'secret';
  }

  if (
    ruleLower.includes('config') ||
    ruleLower.includes('header') ||
    ruleLower.includes('cors') ||
    ruleLower.includes('csrf')
  ) {
    return 'misconfiguration';
  }

  return 'code-smell';
}
