// SPDX-License-Identifier: MIT
/**
 * Tool: detect_antipatterns
 * Detects anti-patterns: god-class, long-method, deep-nesting, etc.
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type {
  AntiPattern,
  AntiPatternType,
  AntiPatternResult,
  DetectAntiPatternsInput,
  Thresholds,
  DEFAULT_THRESHOLDS
} from '../types.js';
import { getAnalyzerForFile, isFileSupported } from '../analyzers/index.js';
import { runRules } from '../rules/antipatterns.js';

export interface AntiPatternReport {
  patterns: AntiPattern[];
  summary: AntiPatternResult['summary'];
  byFile: Map<string, AntiPattern[]>;
  bySeverity: {
    error: AntiPattern[];
    warning: AntiPattern[];
    info: AntiPattern[];
  };
}

/**
 * Detect anti-patterns in a path (file or directory)
 */
export async function detectAntiPatterns(input: DetectAntiPatternsInput): Promise<AntiPatternReport> {
  const { path: targetPath, patterns: enabledPatterns, thresholds: customThresholds } = input;

  const thresholds: Thresholds = {
    maxCyclomaticComplexity: 10,
    maxCognitiveComplexity: 15,
    maxFunctionLines: 50,
    maxClassLines: 300,
    maxNestingDepth: 4,
    maxParameters: 5,
    minDuplicateLines: 6,
    maxFileLines: 500,
    ...customThresholds
  };

  const stats = await fs.stat(targetPath);
  const files: string[] = [];

  if (stats.isDirectory()) {
    const filePatterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'];
    for (const pattern of filePatterns) {
      const matches = await glob(pattern, {
        cwd: targetPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**', '**/vendor/**'],
        absolute: true
      });
      files.push(...matches);
    }
  } else if (isFileSupported(targetPath)) {
    files.push(path.resolve(targetPath));
  }

  const allPatterns: AntiPattern[] = [];
  const byFile: Map<string, AntiPattern[]> = new Map();

  for (const filePath of files) {
    const analyzer = getAnalyzerForFile(filePath);
    if (!analyzer) continue;

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Get patterns from language-specific analyzer
      let filePatterns = analyzer.detectAntiPatterns(content, filePath);

      // Also run generic rules
      const rulePatterns = runRules(content, filePath, thresholds, enabledPatterns);
      filePatterns = [...filePatterns, ...rulePatterns];

      // Filter by enabled patterns if specified
      if (enabledPatterns && enabledPatterns.length > 0) {
        filePatterns = filePatterns.filter(p => enabledPatterns.includes(p.type));
      }

      if (filePatterns.length > 0) {
        byFile.set(filePath, filePatterns);
        allPatterns.push(...filePatterns);
      }
    } catch (error) {
      // Skip files that can't be analyzed
    }
  }

  // Build summary
  const summary: AntiPatternResult['summary'] = {
    'god-class': 0,
    'long-method': 0,
    'deep-nesting': 0,
    'excessive-parameters': 0,
    'magic-numbers': 0,
    'empty-catch': 0,
    'duplicate-code': 0,
    'feature-envy': 0,
    'data-clump': 0,
    'primitive-obsession': 0
  };

  for (const pattern of allPatterns) {
    summary[pattern.type]++;
  }

  // Group by severity
  const bySeverity = {
    error: allPatterns.filter(p => p.severity === 'error'),
    warning: allPatterns.filter(p => p.severity === 'warning'),
    info: allPatterns.filter(p => p.severity === 'info')
  };

  // Sort patterns by severity then by file
  allPatterns.sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return a.file.localeCompare(b.file);
  });

  return {
    patterns: allPatterns,
    summary,
    byFile,
    bySeverity
  };
}

/**
 * Format anti-pattern report as text
 */
export function formatAntiPatternReport(report: AntiPatternReport): string {
  const lines: string[] = [];

  lines.push('# Anti-Pattern Detection Report\n');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Pattern | Count |');
  lines.push('|---------|-------|');

  for (const [type, count] of Object.entries(report.summary)) {
    if (count > 0) {
      lines.push(`| ${type} | ${count} |`);
    }
  }
  lines.push('');

  lines.push('## By Severity');
  lines.push(`- 🔴 Errors: ${report.bySeverity.error.length}`);
  lines.push(`- 🟡 Warnings: ${report.bySeverity.warning.length}`);
  lines.push(`- 🔵 Info: ${report.bySeverity.info.length}`);
  lines.push('');

  if (report.bySeverity.error.length > 0) {
    lines.push('## Errors (Require Immediate Attention)\n');
    for (const pattern of report.bySeverity.error) {
      lines.push(`### ${path.basename(pattern.file)}:${pattern.line} - ${pattern.type}`);
      lines.push(`**${pattern.message}**`);
      lines.push(`💡 ${pattern.suggestion}`);
      lines.push('');
    }
  }

  if (report.bySeverity.warning.length > 0) {
    lines.push('## Warnings (Should Be Addressed)\n');
    for (const pattern of report.bySeverity.warning) {
      lines.push(`- **${path.basename(pattern.file)}:${pattern.line}** [${pattern.type}]`);
      lines.push(`  ${pattern.message}`);
      lines.push(`  💡 ${pattern.suggestion}`);
      lines.push('');
    }
  }

  if (report.bySeverity.info.length > 0 && report.bySeverity.info.length <= 20) {
    lines.push('## Info (Consider Reviewing)\n');
    for (const pattern of report.bySeverity.info) {
      lines.push(`- ${path.basename(pattern.file)}:${pattern.line} [${pattern.type}]: ${pattern.message}`);
    }
    lines.push('');
  } else if (report.bySeverity.info.length > 20) {
    lines.push(`## Info: ${report.bySeverity.info.length} items (hidden for brevity)\n`);
  }

  return lines.join('\n');
}
