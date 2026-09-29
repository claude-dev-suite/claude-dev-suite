// SPDX-License-Identifier: MIT
/**
 * gitleaks and trufflehog output → findings.
 *
 * Neither tool's secret value is ever copied out: gitleaks runs with
 * `--redact` and its `Secret`/`Match` are dropped anyway; trufflehog's `Raw`,
 * `RawV2`, `Redacted` and `SecretParts` are dropped.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SecurityFinding, Severity } from '../types.js';
import { parseJsonStream } from '../utils/report-file.js';

/**
 * gitleaks has no severity. Rules that match a specific provider's credential
 * format are near-certain live credentials (CRITICAL); broad heuristics such
 * as `generic-api-key` have a high false-positive rate (MEDIUM); everything
 * else is HIGH.
 */
const CRITICAL_RULE = new RegExp(
  [
    'private-key',
    '^aws-',
    'gcp-',
    'azure-',
    '^github-',
    '^gitlab-',
    'stripe',
    '^slack-',
    'twilio',
    'sendgrid',
    'npm-access-token',
    'pypi-upload-token',
    'shopify',
    'openai',
    'anthropic',
    'digitalocean',
    'heroku',
    'hashicorp',
    'vault-',
    'doppler',
    'databricks',
    'postman',
    'pulumi',
    'rubygems',
    'nuget',
    'dockerhub|docker-',
    'mailgun',
    'mailchimp',
    'square',
    'paypal|braintree',
  ].join('|'),
  'i'
);
const MEDIUM_RULE = /^(generic-api-key|generic|jwt|jwt-base64|hashicorp-tf-password|curl-auth-.*)$/i;

export function gitleaksSeverity(ruleId: string): Severity {
  if (MEDIUM_RULE.test(ruleId)) return 'MEDIUM';
  if (CRITICAL_RULE.test(ruleId)) return 'CRITICAL';
  return 'HIGH';
}

export function parseGitleaks(report: any, toRel: (p: string) => string): SecurityFinding[] {
  if (!Array.isArray(report)) throw new Error('gitleaks report is not a JSON array');
  return report.map((leak: any) => {
    const file = leak.File ? toRel(String(leak.File)) : undefined;
    return {
    id: leak.RuleID || 'gitleaks-finding',
    severity: gitleaksSeverity(String(leak.RuleID ?? '')),
    category: 'secret' as const,
    source: 'gitleaks' as const,
    title: leak.Description || `Secret detected: ${leak.RuleID}`,
    description: leak.Commit
      ? `${leak.Description || 'Secret'} committed in ${String(leak.Commit).slice(0, 12)}${leak.Date ? ` (${leak.Date})` : ''}`
      : leak.Description || 'Potential secret or credential detected',
    location: {
      file,
      line: leak.StartLine || undefined,
      endLine: leak.EndLine || undefined,
      column: leak.StartColumn || undefined,
      commit: leak.Commit || undefined,
    },
    remediation: leak.Commit
      ? 'Rotate the credential now: it is in git history, so deleting the line does not remove it (rewrite history if needed)'
      : 'Remove the secret from the source, rotate the credential, and load it from a secret manager',
    metadata: {
      severitySource: 'dev-suite rule map (gitleaks reports no severity)',
      entropy: leak.Entropy,
      // gitleaks-compatible fingerprint (usable in .gitleaksignore), built from the relative path.
      fingerprint: [leak.Commit, file, leak.RuleID, leak.StartLine].filter((x) => x !== undefined && x !== '').join(':'),
      author: leak.Author || undefined,
      tags: leak.Tags?.length ? leak.Tags : undefined,
    },
  };
  });
}

/** trufflehog `--json` NDJSON (filesystem and git sources). */
export function parseTrufflehog(text: string, toRel: (p: string) => string): SecurityFinding[] {
  const { values } = parseJsonStream(text);
  const findings: SecurityFinding[] = [];
  for (const leak of values as any[]) {
    if (!leak?.SourceMetadata || !leak.DetectorName) continue; // log line
    const data = leak.SourceMetadata.Data ?? {};
    const fsData = data.Filesystem;
    const gitData = data.Git;
    const file = fsData?.file ?? gitData?.file;
    const verified = leak.Verified === true;
    findings.push({
      id: `trufflehog-${String(leak.DetectorName).toLowerCase()}`,
      severity: verified ? 'CRITICAL' : 'HIGH',
      category: 'secret',
      source: 'trufflehog',
      title: `${leak.DetectorName} credential${verified ? ' (verified live)' : ''}`,
      description: verified
        ? `${leak.DetectorName} credential verified as currently valid by trufflehog`
        : `${leak.DetectorName} credential pattern detected (not verified)`,
      location: {
        file: file ? toRel(String(file)) : undefined,
        line: fsData?.line ?? gitData?.line ?? undefined,
        commit: gitData?.commit || undefined,
      },
      remediation: 'Revoke/rotate the credential immediately, then remove it from the source (and history if committed)',
      metadata: {
        verified,
        detectorType: leak.DetectorType,
        decoder: leak.DecoderName,
        verificationError: leak.VerificationError || undefined,
      },
    });
  }
  return findings;
}
