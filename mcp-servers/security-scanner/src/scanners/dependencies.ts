// SPDX-License-Identifier: MIT
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ScanResult, SecurityFinding, ScanDependenciesInput } from '../types.js';
import { isToolAvailable, getInstallCommand } from '../utils/tool-checker.js';
import { createEmptyResult, calculateSummary, normalizeSeverity, filterBySeverity } from '../utils/normalizer.js';

const execFileAsync = promisify(execFile);

type PackageManager = 'npm' | 'pip' | 'cargo' | 'go';

function detectPackageManager(path: string): PackageManager | null {
  if (existsSync(join(path, 'package.json'))) return 'npm';
  if (existsSync(join(path, 'requirements.txt')) || existsSync(join(path, 'pyproject.toml'))) return 'pip';
  if (existsSync(join(path, 'Cargo.toml'))) return 'cargo';
  if (existsSync(join(path, 'go.mod'))) return 'go';
  return null;
}

async function scanNpm(path: string): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'npm-audit';

  try {
    // npm audit returns exit code 1 if vulnerabilities found, so we catch and parse
    const { stdout } = await execFileAsync('npm', ['audit', '--json'], {
      cwd: path,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32', // npm is a .cmd on Windows
    }).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '{}' }));

    const audit = JSON.parse(stdout);
    const findings: SecurityFinding[] = [];

    // npm audit v7+ format
    if (audit.vulnerabilities) {
      for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities) as [string, any][]) {
        for (const via of vuln.via || []) {
          if (typeof via === 'object') {
            findings.push({
              id: via.url?.split('/').pop() || `npm-${pkgName}`,
              severity: normalizeSeverity(vuln.severity || via.severity || 'medium', 'npm-audit'),
              category: 'vulnerability',
              source: 'npm-audit',
              title: via.title || `Vulnerability in ${pkgName}`,
              description: via.title || 'No description available',
              location: {
                package: pkgName,
                version: vuln.range,
              },
              remediation: vuln.fixAvailable ? `Update to fix: npm audit fix` : undefined,
              references: via.url ? [via.url] : undefined,
            });
          }
        }
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
    return createEmptyResult(scanner, true, `npm audit failed: ${error}`);
  }
}

async function scanPip(path: string): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'pip-audit';

  if (!(await isToolAvailable('pip-audit'))) {
    return createEmptyResult(scanner, false, `pip-audit not installed. ${getInstallCommand('pip-audit')}`);
  }

  try {
    const { stdout } = await execFileAsync('pip-audit', ['--format=json'], {
      cwd: path,
      maxBuffer: 10 * 1024 * 1024,
    }).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '[]' }));

    const vulnerabilities = JSON.parse(stdout);
    const findings: SecurityFinding[] = vulnerabilities.map((v: any) => ({
      id: v.id || v.aliases?.[0] || 'unknown',
      severity: normalizeSeverity(v.fix_versions?.length ? 'HIGH' : 'MEDIUM', 'pip-audit'),
      category: 'vulnerability',
      source: 'pip-audit',
      title: `${v.name}: ${v.id}`,
      description: v.description || 'No description available',
      location: {
        package: v.name,
        version: v.version,
      },
      remediation: v.fix_versions?.length ? `Upgrade to: ${v.fix_versions.join(', ')}` : undefined,
      references: v.aliases?.map((a: string) => `https://nvd.nist.gov/vuln/detail/${a}`),
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
    return createEmptyResult(scanner, true, `pip-audit failed: ${error}`);
  }
}

async function scanCargo(path: string): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'cargo-audit';

  if (!(await isToolAvailable('cargo-audit'))) {
    return createEmptyResult(scanner, false, `cargo-audit not installed. ${getInstallCommand('cargo-audit')}`);
  }

  try {
    const { stdout } = await execFileAsync('cargo', ['audit', '--json'], {
      cwd: path,
      maxBuffer: 10 * 1024 * 1024,
    }).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '{}' }));

    const audit = JSON.parse(stdout);
    const findings: SecurityFinding[] = (audit.vulnerabilities?.list || []).map((v: any) => ({
      id: v.advisory?.id || 'unknown',
      severity: normalizeSeverity(v.advisory?.severity || 'medium', 'cargo-audit'),
      category: 'vulnerability',
      source: 'cargo-audit',
      title: v.advisory?.title || `Vulnerability in ${v.package?.name}`,
      description: v.advisory?.description || 'No description available',
      location: {
        package: v.package?.name,
        version: v.package?.version,
      },
      remediation: v.versions?.patched?.length ? `Upgrade to: ${v.versions.patched.join(', ')}` : undefined,
      references: v.advisory?.url ? [v.advisory.url] : undefined,
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
    return createEmptyResult(scanner, true, `cargo-audit failed: ${error}`);
  }
}

async function scanGo(path: string): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'govulncheck';

  if (!(await isToolAvailable('govulncheck'))) {
    return createEmptyResult(scanner, false, `govulncheck not installed. ${getInstallCommand('govulncheck')}`);
  }

  try {
    const { stdout } = await execFileAsync('govulncheck', ['-json', './...'], {
      cwd: path,
      maxBuffer: 10 * 1024 * 1024,
    }).catch(e => ({ stdout: (e as { stdout?: string }).stdout || '' }));

    // govulncheck outputs NDJSON
    const findings: SecurityFinding[] = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.vulnerability) {
          const vuln = entry.vulnerability;
          findings.push({
            id: vuln.osv?.id || 'unknown',
            severity: 'HIGH', // govulncheck doesn't provide severity
            category: 'vulnerability',
            source: 'govulncheck',
            title: vuln.osv?.summary || `Vulnerability in ${vuln.module?.path}`,
            description: vuln.osv?.details || 'No description available',
            location: {
              package: vuln.module?.path,
              version: vuln.module?.version,
            },
            references: vuln.osv?.references?.map((r: any) => r.url),
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
    return createEmptyResult(scanner, true, `govulncheck failed: ${error}`);
  }
}

export async function scanDependencies(input: ScanDependenciesInput): Promise<ScanResult> {
  const { path, packageManager = 'auto', severityThreshold } = input;

  const pm = packageManager === 'auto' ? detectPackageManager(path) : packageManager;

  if (!pm) {
    return createEmptyResult('dependencies', true, 'No supported package manager detected (package.json, requirements.txt, Cargo.toml, go.mod)');
  }

  let result: ScanResult;

  switch (pm) {
    case 'npm':
      result = await scanNpm(path);
      break;
    case 'pip':
      result = await scanPip(path);
      break;
    case 'cargo':
      result = await scanCargo(path);
      break;
    case 'go':
      result = await scanGo(path);
      break;
    default:
      result = createEmptyResult('dependencies', true, `Unsupported package manager: ${pm}`);
  }

  if (severityThreshold && result.findings.length > 0) {
    result.findings = filterBySeverity(result.findings, severityThreshold);
    result.summary = calculateSummary(result.findings);
  }

  return result;
}
