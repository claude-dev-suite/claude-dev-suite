// SPDX-License-Identifier: MIT
/**
 * Tool: code_metrics
 * Calculates LOC, comments ratio, file sizes, function counts
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type { FileMetrics, MetricsResult, CodeMetricsInput } from '../types.js';
import { getAnalyzerForFile, isFileSupported } from '../analyzers/index.js';

export interface MetricsReport extends MetricsResult {
  byLanguage: Map<string, {
    files: number;
    loc: number;
    sloc: number;
    functions: number;
    classes: number;
  }>;
}

/**
 * Calculate code metrics for a path
 */
export async function calculateMetrics(input: CodeMetricsInput): Promise<MetricsReport> {
  const { path: targetPath, sortBy = 'loc', limit = 20 } = input;

  const stats = await fs.stat(targetPath);
  const fileList: string[] = [];

  if (stats.isDirectory()) {
    const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: targetPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**', '**/vendor/**'],
        absolute: true
      });
      fileList.push(...matches);
    }
  } else if (isFileSupported(targetPath)) {
    fileList.push(path.resolve(targetPath));
  }

  const allMetrics: FileMetrics[] = [];
  const byLanguage: Map<string, { files: number; loc: number; sloc: number; functions: number; classes: number }> = new Map();

  // Initialize language stats
  const languages = ['typescript', 'javascript', 'python', 'java', 'go', 'rust'];
  for (const lang of languages) {
    byLanguage.set(lang, { files: 0, loc: 0, sloc: 0, functions: 0, classes: 0 });
  }

  for (const filePath of fileList) {
    const analyzer = getAnalyzerForFile(filePath);
    if (!analyzer) continue;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const metrics = analyzer.calculateMetrics(content, filePath);
      allMetrics.push(metrics);

      // Update language stats
      const lang = analyzer.language;
      const langStats = byLanguage.get(lang);
      if (langStats) {
        langStats.files++;
        langStats.loc += metrics.loc;
        langStats.sloc += metrics.sloc;
        langStats.functions += metrics.functions;
        langStats.classes += metrics.classes;
      }
    } catch (error) {
      // Skip files that can't be analyzed
    }
  }

  // Calculate totals
  const totals = {
    files: allMetrics.length,
    loc: allMetrics.reduce((sum, m) => sum + m.loc, 0),
    sloc: allMetrics.reduce((sum, m) => sum + m.sloc, 0),
    comments: allMetrics.reduce((sum, m) => sum + m.comments, 0),
    blanks: allMetrics.reduce((sum, m) => sum + m.blanks, 0),
    functions: allMetrics.reduce((sum, m) => sum + m.functions, 0),
    classes: allMetrics.reduce((sum, m) => sum + m.classes, 0)
  };

  // Calculate averages
  const averages = {
    locPerFile: totals.files > 0 ? Math.round(totals.loc / totals.files) : 0,
    functionsPerFile: totals.files > 0 ? Math.round((totals.functions / totals.files) * 100) / 100 : 0,
    commentsRatio: totals.sloc > 0 ? Math.round((totals.comments / totals.sloc) * 10000) / 100 : 0
  };

  // Sort files
  const sortedMetrics = [...allMetrics].sort((a, b) => {
    switch (sortBy) {
      case 'complexity': return b.complexity - a.complexity;
      case 'functions': return b.functions - a.functions;
      case 'loc':
      default: return b.loc - a.loc;
    }
  });

  // Get largest and most complex files
  const largest = [...allMetrics]
    .sort((a, b) => b.loc - a.loc)
    .slice(0, limit);

  const mostComplex = [...allMetrics]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, limit);

  return {
    files: sortedMetrics.slice(0, limit),
    totals,
    averages,
    largest,
    mostComplex,
    byLanguage
  };
}

/**
 * Format metrics report as text
 */
export function formatMetricsReport(report: MetricsReport): string {
  const lines: string[] = [];

  lines.push('# Code Metrics Report\n');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Files | ${report.totals.files} |`);
  lines.push(`| Total Lines (LOC) | ${report.totals.loc.toLocaleString()} |`);
  lines.push(`| Source Lines (SLOC) | ${report.totals.sloc.toLocaleString()} |`);
  lines.push(`| Comment Lines | ${report.totals.comments.toLocaleString()} |`);
  lines.push(`| Blank Lines | ${report.totals.blanks.toLocaleString()} |`);
  lines.push(`| Total Functions | ${report.totals.functions.toLocaleString()} |`);
  lines.push(`| Total Classes/Structs | ${report.totals.classes.toLocaleString()} |`);
  lines.push('');

  lines.push('## Averages');
  lines.push(`- Lines per file: ${report.averages.locPerFile}`);
  lines.push(`- Functions per file: ${report.averages.functionsPerFile}`);
  lines.push(`- Comments ratio: ${report.averages.commentsRatio}%`);
  lines.push('');

  lines.push('## By Language');
  lines.push('');
  lines.push('| Language | Files | LOC | SLOC | Functions | Classes |');
  lines.push('|----------|-------|-----|------|-----------|---------|');
  for (const [lang, stats] of report.byLanguage) {
    if (stats.files > 0) {
      lines.push(`| ${lang} | ${stats.files} | ${stats.loc.toLocaleString()} | ${stats.sloc.toLocaleString()} | ${stats.functions} | ${stats.classes} |`);
    }
  }
  lines.push('');

  if (report.largest.length > 0) {
    lines.push('## Largest Files');
    lines.push('');
    lines.push('| File | LOC | SLOC | Functions | Complexity |');
    lines.push('|------|-----|------|-----------|------------|');
    for (const file of report.largest.slice(0, 10)) {
      const flag = file.loc > 500 ? '⚠️' : '';
      lines.push(`| ${path.basename(file.file)} ${flag} | ${file.loc} | ${file.sloc} | ${file.functions} | ${file.complexity} |`);
    }
    lines.push('');
  }

  if (report.mostComplex.length > 0) {
    lines.push('## Most Complex Files (by avg function complexity)');
    lines.push('');
    lines.push('| File | Avg Complexity | Functions | LOC |');
    lines.push('|------|----------------|-----------|-----|');
    for (const file of report.mostComplex.slice(0, 10)) {
      if (file.complexity > 0) {
        const flag = file.complexity > 10 ? '⚠️' : '';
        lines.push(`| ${path.basename(file.file)} ${flag} | ${file.complexity} | ${file.functions} | ${file.loc} |`);
      }
    }
    lines.push('');
  }

  lines.push('## Recommendations');
  lines.push('');

  if (report.averages.commentsRatio < 5) {
    lines.push('- 📝 Low comments ratio - consider adding more documentation');
  }
  if (report.averages.locPerFile > 300) {
    lines.push('- 📦 High average file size - consider splitting large files');
  }
  if (report.averages.functionsPerFile > 20) {
    lines.push('- 🔧 Many functions per file - check for god modules');
  }

  const highComplexity = report.mostComplex.filter(f => f.complexity > 10).length;
  if (highComplexity > 0) {
    lines.push(`- ⚠️ ${highComplexity} files with high complexity need attention`);
  }

  return lines.join('\n');
}

/**
 * Format as compact JSON-like summary
 */
export function formatCompactMetrics(report: MetricsReport): string {
  return JSON.stringify({
    files: report.totals.files,
    loc: report.totals.loc,
    sloc: report.totals.sloc,
    functions: report.totals.functions,
    classes: report.totals.classes,
    avgLocPerFile: report.averages.locPerFile,
    commentsRatio: `${report.averages.commentsRatio}%`
  }, null, 2);
}
