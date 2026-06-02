// SPDX-License-Identifier: MIT
/**
 * JavaScript/TypeScript Analyzer
 */

import { spawn } from 'child_process';
import { isAbsolute, normalize } from 'path';

/** Reject paths containing null bytes — defence against null-byte injection */
function validateFilePath(filePath: string): void {
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null byte');
  }
  if (!isAbsolute(normalize(filePath))) {
    throw new Error('File path must be absolute');
  }
}

/** Return the platform-appropriate executable name for npm-bundled CLI launchers */
function cmd(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}
import type {
  Language,
  ComplexityResult,
  FunctionComplexity,
  DuplicationResult,
  StyleResult,
  AntiPattern,
  DeadCodeItem,
  FileMetrics,
  LanguageAnalyzer,
  CodeIssue,
  Thresholds,
  DEFAULT_THRESHOLDS
} from '../types.js';
import {
  calculateCyclomaticComplexity,
  calculateCognitiveComplexity,
  calculateNestingDepth,
  countLines,
  findDuplicateBlocks,
  findMagicNumbers,
  findEmptyCatches,
  extractFunctions,
  removeCommentsAndStrings,
  ParsedFunction
} from './base.js';

// Function patterns for JS/TS
const JS_FUNCTION_PATTERNS = [
  /function\s+(\w+)\s*\(([^)]*)\)/g,           // function declarations
  /(\w+)\s*[=:]\s*(?:async\s+)?function\s*\(([^)]*)\)/g,  // function expressions
  /(\w+)\s*[=:]\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,       // arrow functions
  /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*{/g,     // method definitions
];

// Class patterns
const JS_CLASS_PATTERN = /class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/g;

// Import/export patterns
const JS_IMPORT_PATTERN = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"][^'"]+['"]/g;
const JS_EXPORT_PATTERN = /export\s+(?:default\s+)?(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
const JS_NAMED_EXPORT = /export\s*{([^}]+)}/g;

export class JavaScriptAnalyzer implements LanguageAnalyzer {
  language: Language = 'typescript';
  extensions = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'];

  analyzeComplexity(content: string, filePath: string): ComplexityResult {
    const functions = extractFunctions(content, JS_FUNCTION_PATTERNS);
    const functionComplexities: FunctionComplexity[] = [];

    for (const func of functions) {
      const cyclomatic = calculateCyclomaticComplexity(func.body);
      const cognitive = calculateCognitiveComplexity(func.body);
      const lines = func.body.split('\n').length;

      functionComplexities.push({
        name: func.name,
        line: func.line,
        cyclomatic,
        cognitive,
        loc: lines,
        parameters: func.parameters.length
      });
    }

    const avgCyclomatic = functionComplexities.length > 0
      ? functionComplexities.reduce((sum, f) => sum + f.cyclomatic, 0) / functionComplexities.length
      : 0;
    const avgCognitive = functionComplexities.length > 0
      ? functionComplexities.reduce((sum, f) => sum + f.cognitive, 0) / functionComplexities.length
      : 0;

    return {
      file: filePath,
      functions: functionComplexities,
      averageCyclomatic: Math.round(avgCyclomatic * 100) / 100,
      averageCognitive: Math.round(avgCognitive * 100) / 100,
      totalFunctions: functionComplexities.length
    };
  }

  findDuplicates(files: Map<string, string>, minLines = 6): DuplicationResult {
    const duplicates = findDuplicateBlocks(files, minLines);

    let totalDuplicateLines = 0;
    let totalLines = 0;

    for (const [_, content] of files) {
      totalLines += content.split('\n').length;
    }

    for (const dup of duplicates) {
      totalDuplicateLines += dup.lines * (dup.files.length - 1);
    }

    return {
      duplicates,
      totalDuplicateLines,
      duplicationPercentage: totalLines > 0
        ? Math.round((totalDuplicateLines / totalLines) * 10000) / 100
        : 0
    };
  }

  async checkStyle(filePath: string, content: string): Promise<StyleResult> {
    // Try ESLint first, then Biome
    const result = await this.runEslint(filePath);
    if (result) return result;

    const biomeResult = await this.runBiome(filePath);
    if (biomeResult) return biomeResult;

    // Fallback to basic checks
    return this.basicStyleCheck(content, filePath);
  }

  private async runEslint(filePath: string): Promise<StyleResult | null> {
    validateFilePath(filePath);
    return new Promise((resolve) => {
      // shell:false — arguments are passed directly to the process, preventing
      // shell metacharacter expansion in filePath.
      const child = spawn(cmd('npx'), ['eslint', '--format', 'json', filePath], {
        shell: false,
        timeout: 30000
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => { output += data; });
      child.stderr.on('data', (data) => { error += data; });

      child.on('close', (code) => {
        if (error.includes('not found') || error.includes('Cannot find')) {
          resolve(null);
          return;
        }

        try {
          const results = JSON.parse(output);
          const issues: CodeIssue[] = [];
          let errorCount = 0;
          let warningCount = 0;
          let fixableCount = 0;

          for (const file of results) {
            for (const msg of file.messages || []) {
              issues.push({
                file: file.filePath,
                line: msg.line || 1,
                column: msg.column,
                severity: msg.severity === 2 ? 'error' : 'warning',
                message: msg.message,
                rule: msg.ruleId
              });

              if (msg.severity === 2) errorCount++;
              else warningCount++;
              if (msg.fix) fixableCount++;
            }
          }

          resolve({
            tool: 'eslint',
            issues,
            errorCount,
            warningCount,
            fixableCount
          });
        } catch {
          resolve(null);
        }
      });

      child.on('error', () => resolve(null));
    });
  }

  private async runBiome(filePath: string): Promise<StyleResult | null> {
    validateFilePath(filePath);
    return new Promise((resolve) => {
      // shell:false — prevents shell metacharacter expansion in filePath.
      const child = spawn(cmd('npx'), ['biome', 'lint', '--reporter', 'json', filePath], {
        shell: false,
        timeout: 30000
      });

      let output = '';

      child.stdout.on('data', (data) => { output += data; });

      child.on('close', () => {
        try {
          const results = JSON.parse(output);
          const issues: CodeIssue[] = [];

          for (const diag of results.diagnostics || []) {
            issues.push({
              file: filePath,
              line: diag.location?.span?.start?.line || 1,
              column: diag.location?.span?.start?.column,
              severity: diag.severity === 'error' ? 'error' : 'warning',
              message: diag.message,
              rule: diag.category
            });
          }

          resolve({
            tool: 'biome',
            issues,
            errorCount: issues.filter(i => i.severity === 'error').length,
            warningCount: issues.filter(i => i.severity === 'warning').length,
            fixableCount: 0
          });
        } catch {
          resolve(null);
        }
      });

      child.on('error', () => resolve(null));
    });
  }

  private basicStyleCheck(content: string, filePath: string): StyleResult {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check line length
      if (line.length > 120) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: `Line exceeds 120 characters (${line.length})`,
          rule: 'max-line-length'
        });
      }

      // Check trailing whitespace
      if (/\s+$/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'Trailing whitespace',
          rule: 'no-trailing-spaces'
        });
      }

      // Check console.log
      if (/console\.(log|debug|info)\s*\(/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: 'Unexpected console statement',
          rule: 'no-console'
        });
      }

      // Check debugger
      if (/\bdebugger\b/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'error',
          message: 'Unexpected debugger statement',
          rule: 'no-debugger'
        });
      }
    }

    return {
      tool: 'basic',
      issues,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      fixableCount: issues.filter(i => ['no-trailing-spaces'].includes(i.rule || '')).length
    };
  }

  detectAntiPatterns(content: string, filePath: string): AntiPattern[] {
    const patterns: AntiPattern[] = [];
    const functions = extractFunctions(content, JS_FUNCTION_PATTERNS);
    const lines = content.split('\n');

    // Check for long methods
    for (const func of functions) {
      const funcLines = func.endLine - func.line;
      if (funcLines > 50) {
        patterns.push({
          type: 'long-method',
          file: filePath,
          line: func.line,
          endLine: func.endLine,
          severity: funcLines > 100 ? 'error' : 'warning',
          message: `Function '${func.name}' is too long (${funcLines} lines)`,
          details: { lines: funcLines, threshold: 50 },
          suggestion: 'Extract parts of this function into smaller, focused functions'
        });
      }

      // Check for too many parameters
      if (func.parameters.length > 5) {
        patterns.push({
          type: 'excessive-parameters',
          file: filePath,
          line: func.line,
          severity: func.parameters.length > 7 ? 'error' : 'warning',
          message: `Function '${func.name}' has too many parameters (${func.parameters.length})`,
          details: { count: func.parameters.length, threshold: 5 },
          suggestion: 'Consider using an options object pattern'
        });
      }

      // Check for high complexity
      const cyclomatic = calculateCyclomaticComplexity(func.body);
      if (cyclomatic > 10) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: func.line,
          severity: cyclomatic > 20 ? 'error' : 'warning',
          message: `Function '${func.name}' has high cyclomatic complexity (${cyclomatic})`,
          details: { complexity: cyclomatic, threshold: 10 },
          suggestion: 'Reduce complexity by extracting conditions or using polymorphism'
        });
      }

      // Check for deep nesting
      const depth = calculateNestingDepth(func.body);
      if (depth > 4) {
        patterns.push({
          type: 'deep-nesting',
          file: filePath,
          line: func.line,
          severity: depth > 6 ? 'error' : 'warning',
          message: `Function '${func.name}' has deep nesting (${depth} levels)`,
          details: { depth, threshold: 4 },
          suggestion: 'Use early returns, guard clauses, or extract nested logic'
        });
      }
    }

    // Check for god class (large files with many methods)
    const classMatches = content.matchAll(JS_CLASS_PATTERN);
    for (const match of classMatches) {
      if (match.index === undefined) continue;

      const className = match[1];
      const classStart = content.substring(0, match.index).split('\n').length;

      // Find class end
      let braceCount = 0;
      let inClass = false;
      let classEnd = classStart;

      for (let i = classStart - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            braceCount++;
            inClass = true;
          } else if (char === '}') {
            braceCount--;
            if (inClass && braceCount === 0) {
              classEnd = i + 1;
              break;
            }
          }
        }
        if (inClass && braceCount === 0) break;
      }

      const classLines = classEnd - classStart;
      if (classLines > 300) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: classStart,
          endLine: classEnd,
          severity: classLines > 500 ? 'error' : 'warning',
          message: `Class '${className}' is too large (${classLines} lines)`,
          details: { lines: classLines, threshold: 300 },
          suggestion: 'Split this class into smaller, focused classes with single responsibilities'
        });
      }
    }

    // Add empty catches
    patterns.push(...findEmptyCatches(content, filePath));

    return patterns;
  }

  findDeadCode(files: Map<string, string>): DeadCodeItem[] {
    const deadCode: DeadCodeItem[] = [];
    const exports: Map<string, { file: string; line: number; type: string }> = new Map();
    const imports: Set<string> = new Set();

    // First pass: collect all exports and imports
    for (const [filePath, content] of files) {
      const lines = content.split('\n');

      // Find named exports
      const namedExports = content.matchAll(JS_EXPORT_PATTERN);
      for (const match of namedExports) {
        const name = match[1];
        const line = content.substring(0, match.index).split('\n').length;
        exports.set(name, { file: filePath, line, type: 'export' });
      }

      // Find export { ... }
      const exportBraces = content.matchAll(JS_NAMED_EXPORT);
      for (const match of exportBraces) {
        const names = match[1].split(',').map(n => n.trim().split(' ')[0]);
        const line = content.substring(0, match.index).split('\n').length;
        for (const name of names) {
          exports.set(name, { file: filePath, line, type: 'export' });
        }
      }

      // Collect imports
      const importMatches = content.matchAll(/import\s+{([^}]+)}/g);
      for (const match of importMatches) {
        const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
        for (const name of names) {
          imports.add(name);
        }
      }

      // Default imports
      const defaultImports = content.matchAll(/import\s+(\w+)\s+from/g);
      for (const match of defaultImports) {
        imports.add(match[1]);
      }
    }

    // Second pass: find unused exports
    for (const [name, info] of exports) {
      if (!imports.has(name)) {
        // Check if used within the same file
        const content = files.get(info.file) || '';
        const usageRegex = new RegExp(`\\b${name}\\b`, 'g');
        const matches = [...content.matchAll(usageRegex)];

        // If only found once (the export itself), it's unused
        if (matches.length <= 1) {
          deadCode.push({
            type: 'export',
            name,
            file: info.file,
            line: info.line,
            confidence: 'medium'
          });
        }
      }
    }

    return deadCode;
  }

  calculateMetrics(content: string, filePath: string): FileMetrics {
    const { loc, sloc, comments, blanks } = countLines(content);
    const functions = extractFunctions(content, JS_FUNCTION_PATTERNS);
    const classes = [...content.matchAll(JS_CLASS_PATTERN)].length;
    const imports = [...content.matchAll(JS_IMPORT_PATTERN)].length;
    const exports = [...content.matchAll(JS_EXPORT_PATTERN)].length +
                    [...content.matchAll(JS_NAMED_EXPORT)].length;

    // Calculate average complexity
    let totalComplexity = 0;
    for (const func of functions) {
      totalComplexity += calculateCyclomaticComplexity(func.body);
    }

    return {
      file: filePath,
      loc,
      sloc,
      comments,
      blanks,
      functions: functions.length,
      classes,
      imports,
      exports,
      complexity: functions.length > 0 ? Math.round(totalComplexity / functions.length) : 0
    };
  }
}
