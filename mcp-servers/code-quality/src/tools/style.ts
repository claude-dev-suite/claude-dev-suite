// SPDX-License-Identifier: MIT
/**
 * Tool: check_style
 * Runs unified linting (ESLint/Biome/Ruff/Checkstyle/Clippy)
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type { StyleResult, CodeIssue, CheckStyleInput } from '../types.js';
import { getAnalyzerForFile, isFileSupported } from '../analyzers/index.js';

export interface StyleReport {
  files: FileStyleResult[];
  summary: {
    totalFiles: number;
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    fixableCount: number;
    tools: string[];
  };
}

interface FileStyleResult extends StyleResult {
  file: string;
}

/**
 * Check style for a path (file or directory)
 */
export async function checkStyle(input: CheckStyleInput): Promise<StyleReport> {
  const { path: targetPath, fix = false, rules = [] } = input;

  const stats = await fs.stat(targetPath);
  const filesToCheck: string[] = [];

  if (stats.isDirectory()) {
    const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: targetPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**', '**/vendor/**'],
        absolute: true
      });
      filesToCheck.push(...matches);
    }
  } else if (isFileSupported(targetPath)) {
    filesToCheck.push(path.resolve(targetPath));
  }

  const results: FileStyleResult[] = [];
  const tools: Set<string> = new Set();
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;
  let totalFixable = 0;

  for (const filePath of filesToCheck) {
    const analyzer = getAnalyzerForFile(filePath);
    if (!analyzer) continue;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = await analyzer.checkStyle(filePath, content);

      // Filter by rules if specified
      let issues = result.issues;
      if (rules.length > 0) {
        issues = issues.filter(i => rules.includes(i.rule || ''));
      }

      if (issues.length > 0) {
        results.push({
          file: filePath,
          tool: result.tool,
          issues,
          errorCount: issues.filter(i => i.severity === 'error').length,
          warningCount: issues.filter(i => i.severity === 'warning').length,
          fixableCount: result.fixableCount
        });

        tools.add(result.tool);
        totalErrors += issues.filter(i => i.severity === 'error').length;
        totalWarnings += issues.filter(i => i.severity === 'warning').length;
        totalInfo += issues.filter(i => i.severity === 'info').length;
        totalFixable += result.fixableCount;
      }
    } catch (error) {
      // Skip files that can't be analyzed
    }
  }

  // Sort by error count
  results.sort((a, b) => b.errorCount - a.errorCount);

  return {
    files: results,
    summary: {
      totalFiles: filesToCheck.length,
      totalIssues: totalErrors + totalWarnings + totalInfo,
      errorCount: totalErrors,
      warningCount: totalWarnings,
      infoCount: totalInfo,
      fixableCount: totalFixable,
      tools: Array.from(tools)
    }
  };
}

/**
 * Format style report as text
 */
export function formatStyleReport(report: StyleReport): string {
  const lines: string[] = [];

  lines.push('# Style Check Report\n');

  lines.push('## Summary');
  lines.push(`- Files checked: ${report.summary.totalFiles}`);
  lines.push(`- Total issues: ${report.summary.totalIssues}`);
  lines.push(`  - Errors: ${report.summary.errorCount}`);
  lines.push(`  - Warnings: ${report.summary.warningCount}`);
  lines.push(`  - Info: ${report.summary.infoCount}`);
  lines.push(`- Fixable: ${report.summary.fixableCount}`);
  lines.push(`- Tools used: ${report.summary.tools.join(', ') || 'basic'}`);
  lines.push('');

  if (report.files.length > 0) {
    lines.push('## Issues by File\n');

    for (const file of report.files) {
      const filename = path.basename(file.file);
      lines.push(`### ${filename} (${file.errorCount}E ${file.warningCount}W) [${file.tool}]`);
      lines.push('');

      // Group by severity
      const errors = file.issues.filter(i => i.severity === 'error');
      const warnings = file.issues.filter(i => i.severity === 'warning');
      const info = file.issues.filter(i => i.severity === 'info');

      for (const issue of [...errors, ...warnings, ...info]) {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        const rule = issue.rule ? `[${issue.rule}]` : '';
        lines.push(`${icon} Line ${issue.line}: ${issue.message} ${rule}`);
      }
      lines.push('');
    }
  } else {
    lines.push('No style issues found!');
  }

  return lines.join('\n');
}

/**
 * Format issues in a compact single-line format (like ESLint default output)
 */
export function formatCompactStyleReport(report: StyleReport): string {
  const lines: string[] = [];

  for (const file of report.files) {
    for (const issue of file.issues) {
      const severity = issue.severity === 'error' ? 'error' : 'warning';
      const rule = issue.rule ? ` (${issue.rule})` : '';
      const col = issue.column ? `:${issue.column}` : '';
      lines.push(`${file.file}:${issue.line}${col} ${severity}: ${issue.message}${rule}`);
    }
  }

  if (lines.length > 0) {
    lines.push('');
    lines.push(`${report.summary.errorCount} error(s), ${report.summary.warningCount} warning(s)`);
  }

  return lines.join('\n');
}
