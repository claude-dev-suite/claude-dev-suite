// SPDX-License-Identifier: MIT
/**
 * Tool: analyze_complexity
 * Analyzes cyclomatic and cognitive complexity of functions
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type { ComplexityResult, FunctionComplexity, AnalyzeComplexityInput } from '../types.js';
import { getAnalyzerForFile, isFileSupported } from '../analyzers/index.js';

export interface ComplexityReport {
  files: ComplexityResult[];
  summary: {
    totalFiles: number;
    totalFunctions: number;
    averageCyclomatic: number;
    averageCognitive: number;
    highComplexityFunctions: FunctionComplexity[];
  };
}

/**
 * Analyze complexity for a path (file or directory)
 */
export async function analyzeComplexity(input: AnalyzeComplexityInput): Promise<ComplexityReport> {
  const { path: targetPath, threshold = 10, includeAll = false } = input;

  const stats = await fs.stat(targetPath);
  const files: string[] = [];

  if (stats.isDirectory()) {
    // Find all supported files in directory
    const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'];
    for (const pattern of patterns) {
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

  const results: ComplexityResult[] = [];
  const highComplexityFunctions: FunctionComplexity[] = [];
  let totalFunctions = 0;
  let totalCyclomatic = 0;
  let totalCognitive = 0;

  for (const filePath of files) {
    const analyzer = getAnalyzerForFile(filePath);
    if (!analyzer) continue;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = analyzer.analyzeComplexity(content, filePath);

      results.push(result);
      totalFunctions += result.totalFunctions;

      for (const func of result.functions) {
        totalCyclomatic += func.cyclomatic;
        totalCognitive += func.cognitive;

        if (func.cyclomatic >= threshold || func.cognitive >= threshold) {
          highComplexityFunctions.push({
            ...func,
            name: `${path.basename(filePath)}:${func.name}`
          });
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  // Sort high complexity functions by cyclomatic complexity
  highComplexityFunctions.sort((a, b) => b.cyclomatic - a.cyclomatic);

  // Filter results to only show files with complex functions (unless includeAll)
  const filteredResults = includeAll
    ? results
    : results.filter(r => r.functions.some(f => f.cyclomatic >= threshold || f.cognitive >= threshold));

  return {
    files: filteredResults,
    summary: {
      totalFiles: results.length,
      totalFunctions,
      averageCyclomatic: totalFunctions > 0 ? Math.round((totalCyclomatic / totalFunctions) * 100) / 100 : 0,
      averageCognitive: totalFunctions > 0 ? Math.round((totalCognitive / totalFunctions) * 100) / 100 : 0,
      highComplexityFunctions: highComplexityFunctions.slice(0, 20) // Top 20
    }
  };
}

/**
 * Format complexity report as text
 */
export function formatComplexityReport(report: ComplexityReport): string {
  const lines: string[] = [];

  lines.push('# Complexity Analysis Report\n');

  lines.push('## Summary');
  lines.push(`- Files analyzed: ${report.summary.totalFiles}`);
  lines.push(`- Total functions: ${report.summary.totalFunctions}`);
  lines.push(`- Average cyclomatic complexity: ${report.summary.averageCyclomatic}`);
  lines.push(`- Average cognitive complexity: ${report.summary.averageCognitive}`);
  lines.push('');

  if (report.summary.highComplexityFunctions.length > 0) {
    lines.push('## High Complexity Functions\n');
    lines.push('| Function | Line | Cyclomatic | Cognitive | LOC | Params |');
    lines.push('|----------|------|------------|-----------|-----|--------|');

    for (const func of report.summary.highComplexityFunctions) {
      lines.push(`| ${func.name} | ${func.line} | ${func.cyclomatic} | ${func.cognitive} | ${func.loc} | ${func.parameters} |`);
    }
    lines.push('');
  }

  if (report.files.length > 0) {
    lines.push('## File Details\n');
    for (const file of report.files) {
      lines.push(`### ${path.basename(file.file)}`);
      lines.push(`- Functions: ${file.totalFunctions}`);
      lines.push(`- Avg cyclomatic: ${file.averageCyclomatic}`);
      lines.push(`- Avg cognitive: ${file.averageCognitive}`);

      if (file.functions.length > 0) {
        lines.push('\nFunctions:');
        for (const func of file.functions) {
          const flag = func.cyclomatic > 10 || func.cognitive > 15 ? '⚠️' : '';
          lines.push(`- ${func.name} (line ${func.line}): CC=${func.cyclomatic}, Cog=${func.cognitive} ${flag}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
