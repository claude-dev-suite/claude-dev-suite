// SPDX-License-Identifier: MIT
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ScanResult, SecurityFinding, ScanContainerInput } from '../types.js';
import { isToolAvailable, getInstallCommand } from '../utils/tool-checker.js';
import { createEmptyResult, calculateSummary, normalizeSeverity, filterBySeverity } from '../utils/normalizer.js';

const execAsync = promisify(exec);

export async function scanContainer(input: ScanContainerInput): Promise<ScanResult> {
  const startTime = Date.now();
  const scanner = 'trivy';
  const { target, type, severityThreshold } = input;

  if (!(await isToolAvailable('trivy'))) {
    return createEmptyResult(scanner, false, `trivy not installed. ${getInstallCommand('trivy')}`);
  }

  try {
    const scanType = type === 'image' ? 'image' : 'fs';
    const { stdout } = await execAsync(
      `trivy ${scanType} --format json "${target}"`,
      {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600000, // 10 minute timeout for large images
      }
    ).catch(e => ({ stdout: e.stdout || '{}' }));

    const results = JSON.parse(stdout);
    const findings: SecurityFinding[] = [];

    // Handle both image and fs scan results
    const resultsArray = results.Results || [results];

    for (const result of resultsArray) {
      const vulnerabilities = result.Vulnerabilities || [];
      const misconfigurations = result.Misconfigurations || [];

      // Process vulnerabilities
      for (const vuln of vulnerabilities) {
        findings.push({
          id: vuln.VulnerabilityID || 'unknown',
          severity: normalizeSeverity(vuln.Severity || 'UNKNOWN', 'trivy'),
          category: 'vulnerability',
          source: 'trivy',
          title: vuln.Title || `${vuln.VulnerabilityID} in ${vuln.PkgName}`,
          description: vuln.Description || 'No description available',
          location: {
            package: vuln.PkgName,
            version: vuln.InstalledVersion,
            image: type === 'image' ? target : undefined,
            file: result.Target,
          },
          remediation: vuln.FixedVersion ? `Upgrade to version ${vuln.FixedVersion}` : undefined,
          references: vuln.References || [],
          metadata: {
            cvss: vuln.CVSS,
            publishedDate: vuln.PublishedDate,
            lastModifiedDate: vuln.LastModifiedDate,
          },
        });
      }

      // Process misconfigurations
      for (const misconfig of misconfigurations) {
        findings.push({
          id: misconfig.ID || misconfig.AVDID || 'unknown',
          severity: normalizeSeverity(misconfig.Severity || 'MEDIUM', 'trivy'),
          category: 'misconfiguration',
          source: 'trivy',
          title: misconfig.Title || misconfig.ID,
          description: misconfig.Description || misconfig.Message || 'Misconfiguration detected',
          location: {
            file: result.Target || misconfig.CauseMetadata?.Resource,
            line: misconfig.CauseMetadata?.StartLine,
          },
          remediation: misconfig.Resolution || misconfig.Remediation,
          references: misconfig.References || [],
          metadata: {
            type: misconfig.Type,
            resource: misconfig.CauseMetadata?.Resource,
          },
        });
      }
    }

    let filteredFindings = findings;
    if (severityThreshold) {
      filteredFindings = filterBySeverity(findings, severityThreshold);
    }

    return {
      scanner,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      findings: filteredFindings,
      summary: calculateSummary(filteredFindings),
      toolAvailable: true,
    };
  } catch (error) {
    return createEmptyResult(scanner, true, `trivy failed: ${error}`);
  }
}
