// SPDX-License-Identifier: MIT
/**
 * Tool: analyze_dependencies
 * Analyzes import graph and detects circular dependencies
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type { DependencyNode, CircularDependency, DependencyResult, AnalyzeDependenciesInput } from '../types.js';
import { detectLanguage } from '../types.js';
import { isFileSupported } from '../analyzers/index.js';

export interface DependencyReport {
  graph: DependencyResult['graph'];
  circularDependencies: CircularDependency[];
  orphanFiles: string[];
  mostImported: DependencyResult['mostImported'];
  mostDependent: DependencyResult['mostDependent'];
  summary: {
    totalFiles: number;
    totalImports: number;
    circularCount: number;
    orphanCount: number;
    averageImports: number;
    maxDepth: number;
  };
}

// Import patterns by language
const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  javascript: [
    /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    /from\s+([\w.]+)\s+import/g,
    /import\s+([\w.]+)/g,
  ],
  java: [
    /import\s+(?:static\s+)?([\w.]+)/g,
  ],
  go: [
    /import\s+"([^"]+)"/g,
    /import\s+\w+\s+"([^"]+)"/g,
  ],
  rust: [
    /use\s+([\w:]+)/g,
    /mod\s+(\w+)/g,
  ],
};

/**
 * Analyze dependencies in a path
 */
export async function analyzeDependencies(input: AnalyzeDependenciesInput): Promise<DependencyReport> {
  const { path: targetPath, maxDepth = 10, excludeNodeModules = true } = input;

  const stats = await fs.stat(targetPath);
  const files: Map<string, string> = new Map();

  const ignorePatterns = ['**/.git/**', '**/dist/**', '**/build/**', '**/target/**'];
  if (excludeNodeModules) {
    ignorePatterns.push('**/node_modules/**', '**/vendor/**');
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

  // Build dependency graph
  const graph: DependencyResult['graph'] = {};

  for (const [filePath, content] of files) {
    const imports = extractImports(filePath, content, targetPath);

    graph[filePath] = {
      file: filePath,
      imports,
      importedBy: [],
      depth: 0
    };
  }

  // Calculate importedBy
  for (const [filePath, node] of Object.entries(graph)) {
    for (const imported of node.imports) {
      if (graph[imported]) {
        graph[imported].importedBy.push(filePath);
      }
    }
  }

  // Calculate depth (distance from entry points)
  const entryPoints = Object.entries(graph)
    .filter(([_, node]) => node.importedBy.length === 0)
    .map(([file]) => file);

  calculateDepths(graph, entryPoints, maxDepth);

  // Find circular dependencies
  const circularDependencies = findCircularDependencies(graph);

  // Find orphan files (no imports and not imported)
  const orphanFiles = Object.entries(graph)
    .filter(([_, node]) => node.imports.length === 0 && node.importedBy.length === 0)
    .map(([file]) => file);

  // Calculate most imported and most dependent
  const mostImported = Object.entries(graph)
    .map(([file, node]) => ({ file, count: node.importedBy.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const mostDependent = Object.entries(graph)
    .map(([file, node]) => ({ file, count: node.imports.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate summary
  const totalImports = Object.values(graph).reduce((sum, node) => sum + node.imports.length, 0);
  const maxDepthValue = Math.max(...Object.values(graph).map(node => node.depth));

  return {
    graph,
    circularDependencies,
    orphanFiles,
    mostImported,
    mostDependent,
    summary: {
      totalFiles: Object.keys(graph).length,
      totalImports,
      circularCount: circularDependencies.length,
      orphanCount: orphanFiles.length,
      averageImports: Object.keys(graph).length > 0
        ? Math.round((totalImports / Object.keys(graph).length) * 100) / 100
        : 0,
      maxDepth: maxDepthValue
    }
  };
}

/**
 * Extract imports from a file
 */
function extractImports(filePath: string, content: string, basePath: string): string[] {
  const language = detectLanguage(filePath);
  if (!language) return [];

  const patterns = IMPORT_PATTERNS[language] || IMPORT_PATTERNS.typescript;
  const imports: Set<string> = new Set();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];

      // Resolve relative imports
      if (importPath.startsWith('.')) {
        const resolved = resolveImportPath(filePath, importPath, basePath);
        if (resolved) {
          imports.add(resolved);
        }
      }
      // For absolute imports, we'd need module resolution which is complex
    }
  }

  return Array.from(imports);
}

/**
 * Resolve a relative import path to an absolute file path
 */
function resolveImportPath(fromFile: string, importPath: string, basePath: string): string | null {
  const dir = path.dirname(fromFile);
  const resolved = path.resolve(dir, importPath);

  // If it has an extension, use it
  if (path.extname(resolved)) {
    return resolved;
  }

  // Infer extension based on the importing file's extension
  const fromExt = path.extname(fromFile);
  const extMap: Record<string, string> = {
    '.ts': '.ts',
    '.tsx': '.tsx',
    '.js': '.js',
    '.jsx': '.jsx',
    '.py': '.py',
    '.java': '.java',
    '.go': '.go',
    '.rs': '.rs',
  };

  const inferredExt = extMap[fromExt] || '.ts';
  return resolved + inferredExt;
}

/**
 * Calculate depths from entry points using BFS
 */
function calculateDepths(
  graph: DependencyResult['graph'],
  entryPoints: string[],
  maxDepth: number
): void {
  const visited = new Set<string>();
  const queue: { file: string; depth: number }[] = [];

  for (const entry of entryPoints) {
    queue.push({ file: entry, depth: 0 });
  }

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;

    if (visited.has(file) || depth > maxDepth) continue;
    visited.add(file);

    if (graph[file]) {
      graph[file].depth = depth;

      for (const imported of graph[file].imports) {
        if (graph[imported] && !visited.has(imported)) {
          queue.push({ file: imported, depth: depth + 1 });
        }
      }
    }
  }
}

/**
 * Find circular dependencies using DFS
 */
function findCircularDependencies(graph: DependencyResult['graph']): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(file: string, path: string[]): void {
    if (recursionStack.has(file)) {
      // Found a cycle
      const cycleStart = path.indexOf(file);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart);
        cycle.push(file);
        cycles.push({
          cycle,
          length: cycle.length - 1
        });
      }
      return;
    }

    if (visited.has(file)) return;

    visited.add(file);
    recursionStack.add(file);

    const node = graph[file];
    if (node) {
      for (const imported of node.imports) {
        dfs(imported, [...path, file]);
      }
    }

    recursionStack.delete(file);
  }

  for (const file of Object.keys(graph)) {
    if (!visited.has(file)) {
      dfs(file, []);
    }
  }

  // Deduplicate cycles (same cycle starting from different nodes)
  const uniqueCycles: CircularDependency[] = [];
  const seen = new Set<string>();

  for (const cycle of cycles) {
    const normalized = [...cycle.cycle].sort().join('->');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueCycles.push(cycle);
    }
  }

  return uniqueCycles.sort((a, b) => b.length - a.length);
}

/**
 * Format dependency report as text
 */
export function formatDependencyReport(report: DependencyReport): string {
  const lines: string[] = [];

  lines.push('# Dependency Analysis Report\n');

  lines.push('## Summary');
  lines.push(`- Total files: ${report.summary.totalFiles}`);
  lines.push(`- Total imports: ${report.summary.totalImports}`);
  lines.push(`- Average imports per file: ${report.summary.averageImports}`);
  lines.push(`- Max dependency depth: ${report.summary.maxDepth}`);
  lines.push(`- Circular dependencies: ${report.summary.circularCount}`);
  lines.push(`- Orphan files: ${report.summary.orphanCount}`);
  lines.push('');

  if (report.circularDependencies.length > 0) {
    lines.push('## ⚠️ Circular Dependencies\n');
    for (const cycle of report.circularDependencies) {
      lines.push(`### Cycle (${cycle.length} files)`);
      lines.push('```');
      lines.push(cycle.cycle.map(f => path.basename(f)).join(' → '));
      lines.push('```');
      lines.push('');
    }
  }

  if (report.mostImported.length > 0) {
    lines.push('## Most Imported Files\n');
    lines.push('| File | Import Count |');
    lines.push('|------|--------------|');
    for (const { file, count } of report.mostImported) {
      lines.push(`| ${path.basename(file)} | ${count} |`);
    }
    lines.push('');
  }

  if (report.mostDependent.length > 0) {
    lines.push('## Most Dependent Files (Most Imports)\n');
    lines.push('| File | Dependencies |');
    lines.push('|------|--------------|');
    for (const { file, count } of report.mostDependent) {
      lines.push(`| ${path.basename(file)} | ${count} |`);
    }
    lines.push('');
  }

  if (report.orphanFiles.length > 0) {
    lines.push('## Orphan Files (No Dependencies)\n');
    for (const file of report.orphanFiles.slice(0, 20)) {
      lines.push(`- ${path.basename(file)}`);
    }
    if (report.orphanFiles.length > 20) {
      lines.push(`- ... and ${report.orphanFiles.length - 20} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
