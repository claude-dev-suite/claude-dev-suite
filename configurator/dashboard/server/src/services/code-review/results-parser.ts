// SPDX-License-Identifier: MIT
/**
 * Results Parser for Code Review
 *
 * Parses agent output and generates summaries.
 */

import type { ReviewIssue, ReviewSummary } from './types.js';
import { SEVERITY_LEVELS } from './constants.js';

/**
 * Parse agent output for structured issues
 */
export function parseAgentResults(agentId: string, output: string): ReviewIssue[] {
  if (!output) return [];

  const issues: ReviewIssue[] = [];
  const regex = /\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]\s+([^:\s]+):(\d+)\s*[-–]\s*(.+)/gi;
  let match;

  while ((match = regex.exec(output)) !== null) {
    const severity = match[1];
    const file = match[2];
    const lineStr = match[3];
    const message = match[4];
    if (severity && file && lineStr && message) {
      issues.push({
        agentId,
        severity: severity.toLowerCase() as ReviewIssue['severity'],
        file: file.trim(),
        line: parseInt(lineStr, 10),
        message: message.trim(),
      });
    }
  }

  return issues;
}

/**
 * Get summary of issues by severity
 */
export function getSummary(issues: ReviewIssue[]): ReviewSummary {
  const summary: ReviewSummary = {
    total: Array.isArray(issues) ? issues.length : 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  if (!Array.isArray(issues)) return summary;

  for (const issue of issues) {
    if (issue && issue.severity) {
      switch (issue.severity) {
        case 'critical':
          summary.critical++;
          break;
        case 'high':
          summary.high++;
          break;
        case 'medium':
          summary.medium++;
          break;
        case 'low':
          summary.low++;
          break;
        case 'info':
          summary.info++;
          break;
      }
    }
  }

  return summary;
}

/**
 * Check if review results should block based on threshold
 */
export function shouldBlock(
  summary: ReviewSummary,
  threshold: 'critical' | 'high' | 'medium' | 'low' = 'high'
): boolean {
  if (!summary) return false;

  const level = SEVERITY_LEVELS[threshold] || 2;

  if (level >= 1 && summary.critical > 0) return true;
  if (level >= 2 && summary.high > 0) return true;
  if (level >= 3 && summary.medium > 0) return true;
  if (level >= 4 && summary.low > 0) return true;

  return false;
}
