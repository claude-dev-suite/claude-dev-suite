// SPDX-License-Identifier: MIT
/**
 * Tool: find_dead_code
 * Finds unused exports, functions, and variables
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type { DeadCodeItem, DeadCodeResult, FindDeadCodeInput } from '../types.js';
import { getAnalyzerForFile, isFileSupported, getSupportedExtensions } from '../analyzers/index.js';

export interface DeadCodeReport {
  items: DeadCodeItem[];
  byType: DeadCodeResult['byType'];
  byConfidence: {
    high: DeadCodeItem[];
    medium: DeadCodeItem[];
    low: DeadCodeItem[];
  };
  summary: {
    totalFiles: number;
    totalUnused: number;
    estimatedDeadLines: number;
  };
}

/**
 * Find dead code in a path (file or directory)
 */
export async function findDeadCode(input: FindDeadCodeInput): Promise<DeadCodeReport> {
  const { path: targetPath, includeTests = false, confidence = 'medium' } = input;

  const stats = await fs.stat(targetPath);
  const files: Map<string, string> = new Map();

  // Determine ignore patterns
  const ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**', '**/vendor/**'];
  if (!includeTests) {
    ignorePatterns.push('**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/tests/**', '**/test/**');
  }

  if (stats.isDirectory()) {
    const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: targetPath,
        ignore: ignorePatterns,
        absolute: true
      });

      for (const filePath of matches) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          files.set(filePath, content);
        } catch {
          // Skip unreadable files
        }
      }
    }
  } else if (isFileSupported(targetPath)) {
    const content = await fs.readFile(targetPath, 'utf-8');
    files.set(path.resolve(targetPath), content);
  }

  // Analyze each file for dead code
  const allItems: DeadCodeItem[] = [];

  // Group files by language for better analysis
  const filesByLang: Map<string, Map<string, string>> = new Map();

  for (const [filePath, content] of files) {
    const analyzer = getAnalyzerForFile(filePath);
    if (analyzer) {
      const lang = analyzer.language;
      if (!filesByLang.has(lang)) {
        filesByLang.set(lang, new Map());
      }
      filesByLang.get(lang)!.set(filePath, content);
    }
  }

  // Run dead code detection per language
  for (const [lang, langFiles] of filesByLang) {
    const analyzer = getAnalyzerForFile([...langFiles.keys()][0]);
    if (analyzer) {
      const items = analyzer.findDeadCode(langFiles);
      allItems.push(...items);
    }
  }

  // Filter by confidence level
  const confidenceOrder = { high: 3, medium: 2, low: 1 };
  const minConfidence = confidenceOrder[confidence];
  const filteredItems = allItems.filter(item =>
    confidenceOrder[item.confidence] >= minConfidence
  );

  // Build reports
  const byType: DeadCodeResult['byType'] = {};
  for (const item of filteredItems) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }

  const byConfidence = {
    high: filteredItems.filter(i => i.confidence === 'high'),
    medium: filteredItems.filter(i => i.confidence === 'medium'),
    low: filteredItems.filter(i => i.confidence === 'low')
  };

  // Estimate dead lines (rough estimate based on average function size)
  const estimatedDeadLines = filteredItems.reduce((sum, item) => {
    switch (item.type) {
      case 'function': return sum + 15;
      case 'class': return sum + 50;
      case 'variable': return sum + 2;
      case 'export': return sum + 5;
      case 'import': return sum + 1;
      case 'type': return sum + 3;
      default: return sum + 5;
    }
  }, 0);

  return {
    items: filteredItems,
    byType,
    byConfidence,
    summary: {
      totalFiles: files.size,
      totalUnused: filteredItems.length,
      estimatedDeadLines
    }
  };
}

/**
 * Format dead code report as text
 */
export function formatDeadCodeReport(report: DeadCodeReport): string {
  const lines: string[] = [];

  lines.push('# Dead Code Analysis Report\n');

  lines.push('## Summary');
  lines.push(`- Files analyzed: ${report.summary.totalFiles}`);
  lines.push(`- Unused items found: ${report.summary.totalUnused}`);
  lines.push(`- Estimated dead lines: ~${report.summary.estimatedDeadLines}`);
  lines.push('');

  lines.push('## By Type');
  lines.push('');
  lines.push('| Type | Count |');
  lines.push('|------|-------|');
  for (const [type, count] of Object.entries(report.byType)) {
    lines.push(`| ${type} | ${count} |`);
  }
  lines.push('');

  lines.push('## By Confidence');
  lines.push(`- 🔴 High confidence: ${report.byConfidence.high.length}`);
  lines.push(`- 🟡 Medium confidence: ${report.byConfidence.medium.length}`);
  lines.push(`- 🔵 Low confidence: ${report.byConfidence.low.length}`);
  lines.push('');

  if (report.byConfidence.high.length > 0) {
    lines.push('## High Confidence (Likely Unused)\n');
    for (const item of report.byConfidence.high) {
      lines.push(`- **${item.type}** \`${item.name}\` at ${path.basename(item.file)}:${item.line}`);
    }
    lines.push('');
  }

  if (report.byConfidence.medium.length > 0) {
    lines.push('## Medium Confidence (Possibly Unused)\n');
    for (const item of report.byConfidence.medium.slice(0, 30)) {
      lines.push(`- ${item.type} \`${item.name}\` at ${path.basename(item.file)}:${item.line}`);
    }
    if (report.byConfidence.medium.length > 30) {
      lines.push(`- ... and ${report.byConfidence.medium.length - 30} more`);
    }
    lines.push('');
  }

  lines.push('## Recommendations');
  lines.push('');
  lines.push('1. Review high-confidence items first - these are likely safe to remove');
  lines.push('2. Check medium-confidence items manually - they may be used dynamically');
  lines.push('3. Consider using a tool like `ts-prune` or `knip` for more accurate detection');
  lines.push('4. Remember that test files may have different usage patterns');

  return lines.join('\n');
}
